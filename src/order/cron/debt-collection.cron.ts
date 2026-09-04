import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository, Not, IsNull } from 'typeorm';
import { Installment } from '../entities/installment.entity';
import { InstallmentStatus, ExtensionStatus, OrderStatus } from '../types';
import { MailService } from 'src/common/mail/mail.service';
import { Order } from '../entities/order.entity';
import { Payment } from 'src/payment/entities/payment.entity';
import { PaymentStatus } from 'src/payment/types/payment-status.enum';
import { NotificationService } from 'src/notification/notification.service';
import { NotificationType } from 'src/notification/entities/notification.entity';
import { getStartOfTodayInTimezone } from 'src/common/utils/timezone.utils';

import { InstallmentPeriod } from 'src/store/types/installment-period.enum';

@Injectable()
export class DebtCollectionCron {
  private readonly logger = new Logger(DebtCollectionCron.name);

  constructor(
    @InjectRepository(Installment)
    private readonly installmentRepository: Repository<Installment>,

    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,

    @InjectRepository(Payment)
    private readonly paymentRepository: Repository<Payment>,

    private readonly mailService: MailService,
    private readonly notificationService: NotificationService,
  ) {}

  @Cron('0 0 * * *', { timeZone: 'America/Caracas' }) // Corre a la medianoche hora de Venezuela
  async handleLateFees() {
    this.logger.log('Running daily debt collection job...');
    const startOfToday = getStartOfTodayInTimezone(
      new Date(),
      'America/Caracas',
    );

    // 1. Encontrar cuotas con fecha asignada vencida que siguen pendientes (y no tienen prórroga pendiente)
    // Solo se aplican multas a órdenes en PARTIALLY_PAID (donde la 1ra cuota ya fue aprobada)
    const overdueInstallments = await this.installmentRepository.find({
      where: {
        dueDate: LessThan(startOfToday),
        status: InstallmentStatus.PENDING,
        extensionStatus: Not(ExtensionStatus.PENDING),
        order: { status: OrderStatus.PARTIALLY_PAID },
      },
      relations: [
        'order',
        'order.user',
        'order.store',
        'order.orderItems',
        'order.orderItems.item',
      ],
    });

    for (const installment of overdueInstallments) {
      const order = installment.order;

      // [Regla 3.4] Período de gracia de 24 horas si hubo un pago rechazado reciente para esta cuota
      const latestRejectedPayment = await this.paymentRepository.findOne({
        where: { order: { id: order.id }, status: PaymentStatus.REJECTED },
        order: { updatedAt: 'DESC' },
      });

      if (latestRejectedPayment) {
        const hoursSinceRejection =
          (Date.now() - new Date(latestRejectedPayment.updatedAt).getTime()) /
          (1000 * 60 * 60);
        if (hoursSinceRejection < 24) {
          this.logger.log(
            `Skipping late fee for order ${order.id} installment ${installment.id} due to 24h grace period post-rejection`,
          );
          continue;
        }
      }

      // Calcular multa basada en el primer item de la orden
      const lateFeePercent = parseFloat(
        order.orderItems[0]?.item?.lateFeePercentage?.toString() || '0',
      );
      const unpaidPortion =
        parseFloat(installment.amount.toString()) -
        parseFloat((installment.paidAmount || 0).toString());

      if (lateFeePercent > 0 && unpaidPortion > 0) {
        const feeAmount =
          Math.round(((unpaidPortion * lateFeePercent) / 100) * 100) / 100;

        installment.lateFeeApplied =
          parseFloat(installment.lateFeeApplied.toString()) + feeAmount;
        installment.status = InstallmentStatus.OVERDUE;

        // Actualizar balance de la orden
        order.balance = parseFloat(order.balance.toString()) + feeAmount;
        order.remainingBalance =
          parseFloat(order.remainingBalance.toString()) + feeAmount;

        await this.orderRepository.save(order);
        await this.installmentRepository.save(installment);

        this.logger.log(
          `Applied late fee of ${feeAmount} to order ${order.id}`,
        );

        // Notificar al cliente por email y push
        await this.notificationService.create({
          userId: order.user.id,
          title: 'Cuota Vencida - Tu Lojita',
          body: `Tu cuota de $${installment.amount} ha vencido y se ha aplicado un recargo de $${feeAmount}.`,
          type: NotificationType.GENERAL,
          targetId: order.id,
        });
      }
    }
  }

  @Cron('0 9 * * *', { timeZone: 'America/Caracas' }) // Corre a las 09:00 AM hora de Venezuela
  async sendReminders() {
    this.logger.log('Running daily payment reminders...');
    const upcomingInstallments = await this.installmentRepository.find({
      where: {
        status: InstallmentStatus.PENDING,
        dueDate: Not(IsNull()),
      },
      relations: ['order', 'order.user'],
    });

    const now = new Date();
    now.setHours(0, 0, 0, 0);

    for (const installment of upcomingInstallments) {
      if (!installment.dueDate) continue;

      const order = installment.order;
      const dueDate = new Date(installment.dueDate);
      dueDate.setHours(0, 0, 0, 0);

      const diffDays = Math.ceil(
        (dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
      );

      let shouldRemind = false;
      const unit = order.installmentIntervalUnit;

      if (unit === InstallmentPeriod.DAYS) {
        if (diffDays === 1) shouldRemind = true;
      } else if (unit === InstallmentPeriod.WEEKS) {
        if (diffDays === 2) shouldRemind = true;
      } else if (unit === InstallmentPeriod.MONTHS) {
        if (diffDays === 3) shouldRemind = true;
      } else {
        if (diffDays === 2) shouldRemind = true;
      }

      if (shouldRemind) {
        await this.mailService.sendPaymentReminder(
          order.user.email,
          order.user.firstName,
          installment.amount,
          installment.dueDate,
          order.id,
        );
        this.logger.log(
          `Sent payment reminder for order ${order.id} (Due in ${diffDays} days)`,
        );
      }
    }
  }
}
