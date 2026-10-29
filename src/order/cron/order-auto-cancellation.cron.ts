import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, IsNull, LessThan, Repository } from 'typeorm';
import { Order } from '../entities/order.entity';
import { OrderStatus } from '../types';
import { ItemVariant } from 'src/item/entities/item-variant.entity';
import { Payment } from 'src/payment/entities/payment.entity';
import { PaymentStatus } from 'src/payment/types/payment-status.enum';
import { NotificationService } from 'src/notification/notification.service';
import { NotificationType } from 'src/notification/entities/notification.entity';
import { MailService } from 'src/common/mail/mail.service';
import { OrderDispute } from 'src/order-dispute/entities/order-dispute.entity';
import { DisputeStatus, DisputeType } from 'src/order-dispute/types';
import { OrderSlotBooking } from '../entities/order-slot-booking.entity';
import { SlotBookingStatus } from '../types/slot-booking-status.enum';

@Injectable()
export class OrderAutoCancellationCron {
  private readonly logger = new Logger(OrderAutoCancellationCron.name);

  constructor(
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,

    @InjectRepository(Payment)
    private readonly paymentRepository: Repository<Payment>,

    @InjectRepository(OrderDispute)
    private readonly orderDisputeRepository: Repository<OrderDispute>,

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
            if (item.hasVariants && orderItem.variantId) {
              const variant = await queryRunner.manager.findOne(ItemVariant, {
                where: { id: orderItem.variantId },
              });
              if (variant) {
                const currentStock = parseFloat(
                  variant.stockQuantity?.toString() || '0',
                );
                variant.stockQuantity = currentStock + orderItem.quantity;
                await queryRunner.manager.save(variant);
              } else {
                const currentStock = parseFloat(
                  item.stockQuantity?.toString() || '0',
                );
                item.stockQuantity = currentStock + orderItem.quantity;
                await queryRunner.manager.save(item);
              }
            } else {
              const currentStock = parseFloat(
                item.stockQuantity?.toString() || '0',
              );
              item.stockQuantity = currentStock + orderItem.quantity;
              await queryRunner.manager.save(item);
            }
          }
        }

        // 1b. Liberar reservas de turnos asociadas a la orden
        const activeBookings = await queryRunner.manager.find(OrderSlotBooking, {
          where: {
            order: { id: order.id },
            status: In([SlotBookingStatus.CONFIRMED, SlotBookingStatus.HOLD]),
          },
        });
        for (const sb of activeBookings) {
          sb.status = SlotBookingStatus.CANCELLED;
          await queryRunner.manager.save(sb);
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
        this.logger.error(`Failed to auto-cancel order ${order.id}: ${errMsg}`);
      } finally {
        await queryRunner.release();
      }
    }
  }

  @Cron('0 * * * *') // Corre cada hora en punto
  async handleRefundInactivityAutoConfirmation() {
    this.logger.log('Checking for pending refunds exceeding 48h inactivity...');
    const thresholdDate = new Date(Date.now() - 48 * 60 * 60 * 1000);

    const pendingRefundPayments = await this.paymentRepository.find({
      where: {
        status: PaymentStatus.REFUND_PENDING,
        updatedAt: LessThan(thresholdDate),
      },
      relations: [
        'order',
        'order.store',
        'order.store.owner',
        'order.user',
        'order.payments',
      ],
    });

    for (const payment of pendingRefundPayments) {
      this.logger.log(
        `Auto-confirming refund for payment ${payment.id} (Order ${payment.order?.id}) due to 48h client inactivity...`,
      );

      try {
        payment.status = PaymentStatus.REFUNDED;
        payment.rejectionReason =
          'Reembolso confirmado automáticamente por inactividad del cliente tras 48h.';
        await this.paymentRepository.save(payment);

        const order = payment.order;
        if (order) {
          // Si todos los pagos de la orden están resueltos (REFUNDED o REJECTED), cerrar sala de chat
          const allResolved = (order.payments || []).every(
            (p) =>
              p.id === payment.id ||
              p.status === PaymentStatus.REFUNDED ||
              p.status === PaymentStatus.REJECTED,
          );

          if (allResolved) {
            await this.notificationService.closeChatRoom(
              order.id,
              'Reembolso completado y confirmado automáticamente tras 48h sin objeción.',
            );
          }

          const orderCode = order.id.split('-')[0].toUpperCase();
          if (order.user?.id) {
            await this.notificationService.create({
              userId: order.user.id,
              title: 'Reembolso confirmado automáticamente',
              body: `El reembolso de tu orden #${orderCode} ha sido confirmado automáticamente tras cumplirse el plazo de 48 horas sin objeción.`,
              type: NotificationType.GENERAL,
              orderId: order.id,
            });
          }
          if (order.store?.owner?.id) {
            await this.notificationService.create({
              userId: order.store.owner.id,
              title: 'Reembolso finalizado por inactividad',
              body: `El reembolso de la orden #${orderCode} ha finalizado automáticamente tras 48 horas sin reclamo del cliente.`,
              type: NotificationType.GENERAL,
              orderId: order.id,
            });
          }
        }
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        this.logger.error(
          `Failed to auto-confirm refund for payment ${payment.id}: ${errMsg}`,
        );
      }
    }
  }

  @Cron('30 * * * *') // Corre a los 30 minutos de cada hora
  async handleMerchantInactivityAutoDispute() {
    this.logger.log(
      'Checking for cancelled orders exceeding 72h merchant inactivity...',
    );
    const thresholdDate = new Date(Date.now() - 72 * 60 * 60 * 1000);

    const cancelledOrders = await this.orderRepository.find({
      where: [
        {
          status: OrderStatus.CANCELLED,
          cancelledAt: LessThan(thresholdDate),
        },
        {
          status: OrderStatus.CANCELLED,
          cancelledAt: IsNull(),
          updatedAt: LessThan(thresholdDate),
        },
      ],
      relations: ['user', 'store', 'store.owner', 'payments'],
    });

    for (const order of cancelledOrders) {
      // Verificar si hay pagos esperando verificación o pendientes que la tienda nunca atendió
      const hasUnresolvedPayment = (order.payments || []).some(
        (p) =>
          p.status === PaymentStatus.WAITING_VERIFICATION ||
          p.status === PaymentStatus.PENDING,
      );

      if (!hasUnresolvedPayment || !order.user?.id) {
        continue;
      }

      try {
        // Verificar si ya existe una disputa abierta o en revisión
        const existingDispute = await this.orderDisputeRepository.findOne({
          where: {
            orderId: order.id,
            status: In([
              DisputeStatus.OPEN,
              DisputeStatus.MERCHANT_RESPONDED,
              DisputeStatus.ADMIN_REVIEW,
            ]),
          },
        });

        if (existingDispute) {
          continue;
        }

        this.logger.log(
          `Auto-escalating cancelled order ${order.id} to dispute due to 72h merchant inactivity...`,
        );

        const dispute = this.orderDisputeRepository.create({
          orderId: order.id,
          requestedById: order.user.id,
          type: DisputeType.REFUND_REQUEST,
          status: DisputeStatus.OPEN,
          description:
            'Disputa generada automáticamente por el sistema tras 72 horas de inactividad de la tienda sin procesar el reembolso o verificación de la cancelación.',
          evidenceUrls: [],
        });

        await this.orderDisputeRepository.save(dispute);

        const orderCode = order.id.split('-')[0].toUpperCase();

        // Notificar a la tienda
        if (order.store?.owner?.id) {
          await this.notificationService.create({
            userId: order.store.owner.id,
            title: 'Disputa abierta por inactividad (72h)',
            body: `Se ha abierto una disputa para la orden #${orderCode} por falta de respuesta o procesamiento del pago tras su cancelación.`,
            type: NotificationType.GENERAL,
            orderId: order.id,
          });
        }

        // Notificar al cliente
        await this.notificationService.create({
          userId: order.user.id,
          title: 'Disputa automática iniciada',
          body: `Debido a que la tienda no respondió en 72 horas para procesar tu orden cancelada #${orderCode}, se ha iniciado una disputa automática para proteger tu dinero.`,
          type: NotificationType.GENERAL,
          orderId: order.id,
        });
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        this.logger.error(
          `Failed to auto-escalate dispute for order ${order.id}: ${errMsg}`,
        );
      }
    }
  }
}
