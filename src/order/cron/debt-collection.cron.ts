import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { Installment } from '../entities/installment.entity';
import { InstallmentStatus } from '../types';
import { MailService } from 'src/common/mail/mail.service';
import { Order } from '../entities/order.entity';
import { NotificationService } from 'src/notification/notification.service';
import { NotificationType } from 'src/notification/entities/notification.entity';

@Injectable()
export class DebtCollectionCron {
  private readonly logger = new Logger(DebtCollectionCron.name);

  constructor(
    @InjectRepository(Installment)
    private readonly installmentRepository: Repository<Installment>,
    
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,

    private readonly mailService: MailService,
    private readonly notificationService: NotificationService,
  ) {}

  @Cron('0 0 * * *', { timeZone: 'America/Caracas' }) // Corre a la medianoche hora de Venezuela
  async handleLateFees() {
    this.logger.log('Running daily debt collection job...');
    const now = new Date();

    // 1. Encontrar cuotas vencidas que siguen pendientes
    const overdueInstallments = await this.installmentRepository.find({
      where: {
        dueDate: LessThan(now),
        status: InstallmentStatus.PENDING,
      },
      relations: ['order', 'order.user', 'order.store', 'order.orderItems', 'order.orderItems.item'],
    });

    for (const installment of overdueInstallments) {
      const order = installment.order;
      
      // Calcular multa basada en el primer item de la orden (como referencia de configuración)
      // En una versión más compleja, se podría promediar o tomar el máximo lateFeePercentage
      const lateFeePercent = parseFloat(order.orderItems[0]?.item?.lateFeePercentage?.toString() || '0');
      
      if (lateFeePercent > 0) {
        const feeAmount = Math.round(((installment.amount * lateFeePercent) / 100) * 100) / 100;
        
        installment.lateFeeApplied = parseFloat(installment.lateFeeApplied.toString()) + feeAmount;
        installment.status = InstallmentStatus.OVERDUE;
        
        // Actualizar balance de la orden
        order.balance = parseFloat(order.balance.toString()) + feeAmount;
        order.remainingBalance = parseFloat(order.remainingBalance.toString()) + feeAmount;
        
        await this.orderRepository.save(order);
        await this.installmentRepository.save(installment);

        this.logger.log(`Applied late fee of ${feeAmount} to order ${order.id}`);

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
      },
      relations: ['order', 'order.user'],
    });

    const now = new Date();
    now.setHours(0, 0, 0, 0);

    for (const installment of upcomingInstallments) {
      const order = installment.order;
      const dueDate = new Date(installment.dueDate);
      dueDate.setHours(0, 0, 0, 0);

      const diffDays = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      let shouldRemind = false;
      const unit = order.installmentIntervalUnit;

      if (unit === 'DAYS') {
        // Para pagos diarios, recordar 1 día antes
        if (diffDays === 1) shouldRemind = true;
      } else if (unit === 'WEEKS') {
        // Para pagos semanales, recordar 2 días antes
        if (diffDays === 2) shouldRemind = true;
      } else if (unit === 'MONTHS') {
        // Para pagos mensuales, recordar 3 días antes
        if (diffDays === 3) shouldRemind = true;
      } else {
        // Default: 2 días antes
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
        this.logger.log(`Sent payment reminder for order ${order.id} (Due in ${diffDays} days)`);
      }
    }
  }
}
