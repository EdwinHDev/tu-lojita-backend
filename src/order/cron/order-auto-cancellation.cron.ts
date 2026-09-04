import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, LessThan, Repository } from 'typeorm';
import { Order } from '../entities/order.entity';
import { OrderStatus } from '../types';
import { Payment } from 'src/payment/entities/payment.entity';
import { PaymentStatus } from 'src/payment/types/payment-status.enum';
import { NotificationService } from 'src/notification/notification.service';
import { NotificationType } from 'src/notification/entities/notification.entity';
import { MailService } from 'src/common/mail/mail.service';

@Injectable()
export class OrderAutoCancellationCron {
  private readonly logger = new Logger(OrderAutoCancellationCron.name);

  constructor(
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,

    @InjectRepository(Payment)
    private readonly paymentRepository: Repository<Payment>,

    private readonly dataSource: DataSource,
    private readonly notificationService: NotificationService,
    private readonly mailService: MailService,
  ) {}

  @Cron('*/15 * * * *') // Corre cada 15 minutos
  async handleAutoCancellations() {
    this.logger.log('Checking for rejected orders exceeding 24h inactivity...');
    const thresholdDate = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const rejectedOrders = await this.orderRepository.find({
      where: {
        status: OrderStatus.REJECTED,
        updatedAt: LessThan(thresholdDate),
      },
      relations: ['user', 'store', 'orderItems', 'orderItems.item', 'payments'],
    });

    for (const order of rejectedOrders) {
      // Verificar si hay algún pago en revisión o aprobado
      const hasPendingOrApprovedPayment = (order.payments || []).some(
        (p) =>
          p.status === PaymentStatus.WAITING_VERIFICATION ||
          p.status === PaymentStatus.APPROVED,
      );

      if (hasPendingOrApprovedPayment) {
        continue;
      }

      this.logger.log(
        `Auto-cancelling order ${order.id} (Rejected and inactive for >24h)...`,
      );

      const queryRunner = this.dataSource.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();

      try {
        // 1. Devolver stock reservado
        for (const orderItem of order.orderItems || []) {
          const item = orderItem.item;
          if (item && item.trackInventory) {
            const currentStock = parseFloat(
              item.stockQuantity?.toString() || '0',
            );
            item.stockQuantity = currentStock + orderItem.quantity;
            await queryRunner.manager.save(item);
          }
        }

        // 2. Marcar orden como CANCELLED
        order.status = OrderStatus.CANCELLED;
        await queryRunner.manager.save(order);
        await queryRunner.commitTransaction();

        this.logger.log(`Order ${order.id} auto-cancelled and stock restored.`);

        // 3. Notificar al cliente
        try {
          await this.notificationService.create({
            userId: order.user.id,
            title: 'Orden Cancelada por Inactividad',
            body: `Tu orden #${order.id.split('-')[0].toUpperCase()} en ${order.store.name} ha sido cancelada por no registrar un nuevo pago en las últimas 24 horas.`,
            type: NotificationType.ORDER_REJECTED,
            orderId: order.id,
          });

          // Enviar correo de cancelación
          const customerName = `${order.user.firstName}${order.user.lastName ? ' ' + order.user.lastName : ''}`;
          this.mailService
            .sendOrderAutoCancelled(
              order.user.email,
              customerName,
              order.store.name,
              order.id,
            )
            .catch((e: unknown) => {
              const msg = e instanceof Error ? e.message : String(e);
              this.logger.error(`Error sending cancel email: ${msg}`);
            });

          // Cerrar chat
          this.notificationService.closeChatRoom(order.id, 'rejected');
        } catch (notifErr: unknown) {
          const notifMsg =
            notifErr instanceof Error ? notifErr.message : String(notifErr);
          this.logger.error(
            `Error notifying customer for auto-cancelled order ${order.id}: ${notifMsg}`,
          );
        }
      } catch (err: unknown) {
        await queryRunner.rollbackTransaction();
        const errMsg = err instanceof Error ? err.message : String(err);
        this.logger.error(
          `Failed to auto-cancel order ${order.id}: ${errMsg}`,
        );
      } finally {
        await queryRunner.release();
      }
    }
  }
}
