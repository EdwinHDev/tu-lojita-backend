import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, In, EntityManager, MoreThan } from 'typeorm';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { UpdatePaymentDto } from './dto/update-payment.dto';
import { Payment } from './entities/payment.entity';
import { PaymentStatus } from './types';
import { Order } from 'src/order/entities/order.entity';
import { OrderStatus } from 'src/order/types';
import { User } from 'src/user/entities/user.entity';
import { UserRole } from 'src/user/types';
import { Store } from 'src/store/entities/store.entity';
import { StoreCustomerBlock } from 'src/store/entities/store-customer-block.entity';
import { PaymentPaginationDto } from './dto/payment-pagination.dto';
import { NotificationService } from 'src/notification/notification.service';
import { NotificationType } from 'src/notification/entities/notification.entity';
import { InstallmentPeriod } from 'src/store/types/installment-period.enum';
import { MailService } from 'src/common/mail/mail.service';
import { CreatePaymentWithOrderDto } from './dto/create-payment-with-order.dto';
import { Item } from 'src/item/entities/item.entity';
import { ItemVariant } from 'src/item/entities/item-variant.entity';
import { OrderItem } from 'src/order-item/entities/order-item.entity';
import { Installment } from 'src/order/entities/installment.entity';
import { CompanyActivityLogService } from 'src/company/services/company-activity-log.service';
import { ActivityLogModule } from 'src/company/entities/company-activity-log.entity';
import { InstallmentStatus } from 'src/order/types';
import { StoreStatus } from 'src/store/types/status.enum';
import { CommissionService } from 'src/commission/commission.service';
import { PlatformSettingsService } from 'src/platform-settings/platform-settings.service';
import { ItemTimeSlot } from 'src/item/entities/item-time-slot.entity';
import { OrderSlotBooking } from 'src/order/entities/order-slot-booking.entity';
import { SlotBookingStatus } from 'src/order/types/slot-booking-status.enum';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    @InjectRepository(Payment)
    private readonly paymentRepository: Repository<Payment>,

    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,

    @InjectRepository(User)
    private readonly userRepository: Repository<User>,

    @InjectRepository(Store)
    private readonly storeRepository: Repository<Store>,

    private readonly dataSource: DataSource,
    private readonly notificationService: NotificationService,
    private readonly mailService: MailService,
    private readonly commissionService: CommissionService,
    private readonly platformSettingsService: PlatformSettingsService,
    private readonly activityLogService: CompanyActivityLogService,
  ) {}

  async verifyPayment(
    paymentId: string,
    newStatus: PaymentStatus,
    storeOwnerId: string,
    rejectionReason?: string,
    receiptImage?: string,
    bypassFraudPenalty: boolean = false,
    actor?: any,
  ) {
    if (
      newStatus !== PaymentStatus.APPROVED &&
      newStatus !== PaymentStatus.REJECTED &&
      newStatus !== PaymentStatus.REFUNDED &&
      newStatus !== PaymentStatus.REFUND_PENDING
    ) {
      throw new BadRequestException(
        'Estado de verificación no válido. Debe ser APPROVED, REJECTED, REFUNDED o REFUND_PENDING',
      );
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    let payment: Payment | null = null;
    let store: Store | null = null;
    let nextInstallmentForNotification: {
      index: number;
      amount: number;
      dueDate: Date;
    } | null = null;

    try {
      payment = await queryRunner.manager.findOne(Payment, {
        where: { id: paymentId },
        relations: [
          'order',
          'order.user',
          'store',
          'store.owner',
          'store.company',
          'user',
        ],
      });

      if (!payment)
        throw new NotFoundException(`Pago #${paymentId} no encontrado`);

      if (
        newStatus === PaymentStatus.REFUNDED ||
        newStatus === PaymentStatus.REFUND_PENDING
      ) {
        if (payment.status === PaymentStatus.REFUNDED) {
          throw new BadRequestException(
            'Este pago ya ha sido procesado como reembolsado previamente',
          );
        }
        if (payment.status === PaymentStatus.REJECTED) {
          throw new BadRequestException(
            'No se puede reembolsar un pago que fue rechazado',
          );
        }
      } else if (payment.status !== PaymentStatus.WAITING_VERIFICATION) {
        throw new BadRequestException(
          'Este pago ya ha sido procesado previamente',
        );
      }

      const isCollab =
        (actor as any)?.isCollaborator === true ||
        (actor as any)?.actorType === 'COLLABORATOR';

      if (isCollab) {
        const collab = actor as any;
        if (
          !payment.store?.company?.id ||
          payment.store.company.id !== collab.company?.id
        ) {
          throw new ForbiddenException(
            'No tienes permiso para verificar pagos de esta empresa',
          );
        }
        if (
          !collab.hasFullBranchAccess &&
          !(collab.allowedBranchIds || []).includes(payment.store.id)
        ) {
          throw new ForbiddenException(
            'No tienes autorización para gestionar pagos en esta sucursal',
          );
        }

        const permissions: string[] = collab.permissions || [];
        if (
          newStatus === PaymentStatus.APPROVED &&
          !permissions.includes('installments:approve_payment')
        ) {
          throw new ForbiddenException(
            'No tienes permiso para aprobar pagos de cuotas',
          );
        }
        if (
          newStatus === PaymentStatus.REJECTED &&
          !permissions.includes('installments:reject_payment')
        ) {
          throw new ForbiddenException(
            'No tienes permiso para rechazar pagos de cuotas',
          );
        }
      } else {
        if (!payment.store.owner || payment.store.owner.id !== storeOwnerId) {
          throw new BadRequestException(
            'No tienes permiso para verificar pagos de esta tienda',
          );
        }
      }

      // Validar si la orden fue cancelada por el cliente
      if (payment.order && payment.order.status === OrderStatus.CANCELLED) {
        if (newStatus === PaymentStatus.APPROVED) {
          throw new BadRequestException(
            'No se puede aprobar el pago de una orden que ya ha sido cancelada por el cliente.',
          );
        }
      }

      store = payment.store;

      if (newStatus === PaymentStatus.APPROVED) {
        // Bloquear la orden primero
        await queryRunner.manager.findOne(Order, {
          where: { id: payment.order.id },
          lock: { mode: 'pessimistic_write' },
        });

        // Cargar con relaciones después
        const order = await queryRunner.manager.findOne(Order, {
          where: { id: payment.order.id },
          relations: ['payments'],
        });

        if (!order)
          throw new NotFoundException(`Orden de la transacción no encontrada`);

        const approvedPayments = order.payments.filter(
          (p) => p.status === PaymentStatus.APPROVED,
        );

        // ── Cargar cuotas para validaciones y amortización ──────────────
        let installmentsForValidation: Installment[] = [];
        if (order.isPartialPayment) {
          installmentsForValidation = await queryRunner.manager.find(
            Installment,
            {
              where: { order: { id: order.id } },
              order: { dueDate: 'ASC' },
            },
          );
        }

        if (order.isPartialPayment && approvedPayments.length === 0) {
          // Validación de cuota inicial (primer pago)
          const minPercentage = parseFloat(
            store.minInitialPaymentPercentage.toString(),
          );
          const minAmount = (order.finalAmount * minPercentage) / 100;
          const minAmountCents = Math.round(minAmount * 100);
          const currentAmount = parseFloat(payment.amount.toString());
          const currentCents = Math.round(currentAmount * 100);

          if (currentCents < minAmountCents - 1) {
            throw new BadRequestException(
              `El pago inicial ($${currentAmount.toFixed(2)}) es menor al mínimo requerido ($${(minAmountCents / 100).toFixed(2)})`,
            );
          }
        } else if (order.isPartialPayment && approvedPayments.length > 0) {
          // Validación de cuotas 2+ — el pago debe cubrir íntegramente la próxima cuota pendiente
          const nextPending = installmentsForValidation.find(
            (inst) => inst.status !== InstallmentStatus.PAID,
          );
          if (nextPending) {
            const instAmount = parseFloat(nextPending.amount.toString());
            const instLateFee = parseFloat(
              nextPending.lateFeeApplied.toString(),
            );
            const instPaid = parseFloat(
              (nextPending.paidAmount || 0).toString(),
            );
            let minRequired = instAmount + instLateFee - instPaid;
            const currentBalance = parseFloat(
              order.remainingBalance?.toString() || order.balance.toString(),
            );
            if (minRequired > currentBalance) {
              minRequired = currentBalance;
            }
            const currentAmount = parseFloat(payment.amount.toString());

            const currentCents = Math.round(currentAmount * 100);
            const minRequiredCents = Math.round(minRequired * 100);

            // Determinar el número de la cuota para el mensaje de error
            const cuotaIndex =
              installmentsForValidation.indexOf(nextPending) + 1;

            if (currentCents < minRequiredCents - 1) {
              throw new BadRequestException(
                `El pago ($${currentAmount.toFixed(2)}) es menor al mínimo requerido para la Cuota ${cuotaIndex} ($${minRequired.toFixed(2)}). No se permiten abonos parciales.`,
              );
            }
          }
        }

        const currentBalance = parseFloat(
          order.remainingBalance?.toString() || order.balance.toString(),
        );
        const amount = parseFloat(payment.amount.toString());

        order.totalPaidAmount =
          parseFloat(order.totalPaidAmount?.toString() || '0') + amount;
        const rawNewBalance = currentBalance - amount;
        const newBalance =
          Math.round(rawNewBalance * 100) <= 1
            ? 0
            : Math.round(rawNewBalance * 100) / 100;
        order.remainingBalance = newBalance;
        order.balance = order.remainingBalance;

        // Amortización equitativa por cuota pagada
        if (order.isPartialPayment) {
          const installments = installmentsForValidation;

          // Obtener pagos aprobados ordenados cronológicamente
          const approvedPayments = order.payments
            .filter(
              (p) => p.status === PaymentStatus.APPROVED || p.id === paymentId,
            )
            .sort(
              (a, b) =>
                new Date(a.createdAt).getTime() -
                new Date(b.createdAt).getTime(),
            );

          let totalApprovedCents = approvedPayments.reduce(
            (sum, p) => sum + Math.round(parseFloat(p.amount.toString()) * 100),
            0,
          );

          const isFullySettled = newBalance === 0;

          if (isFullySettled) {
            // Si el saldo restante es 0, todas las cuotas quedan marcadas como pagadas
            for (const inst of installments) {
              const currentAmount = parseFloat(inst.amount.toString());
              inst.paidAmount = currentAmount;
              inst.status = InstallmentStatus.PAID;
              if (!inst.paymentDate && approvedPayments.length > 0) {
                inst.paymentDate = new Date(
                  approvedPayments[approvedPayments.length - 1].createdAt,
                );
              }
              await queryRunner.manager.save(inst);
            }
          } else {
            // Amortizar cuotas según el total acumulado de pagos aprobados
            for (const installment of installments) {
              const origAmountCents = Math.round(
                parseFloat(installment.amount.toString()) * 100,
              );
              const lateFeeCents = Math.round(
                parseFloat((installment.lateFeeApplied || 0).toString()) * 100,
              );
              const neededCents = origAmountCents + lateFeeCents;

              if (totalApprovedCents >= neededCents - 1) {
                totalApprovedCents -= neededCents;
                installment.paidAmount = installment.amount;
                installment.status = InstallmentStatus.PAID;
                if (!installment.paymentDate && approvedPayments.length > 0) {
                  installment.paymentDate = new Date(
                    approvedPayments[0].createdAt,
                  );
                }
                await queryRunner.manager.save(installment);
              } else {
                const paidVal = Math.round(totalApprovedCents) / 100;
                totalApprovedCents = 0;
                installment.paidAmount = paidVal;
                installment.status = InstallmentStatus.PENDING;
                await queryRunner.manager.save(installment);
              }
            }
          }

          // Recalcular la próxima fecha de vencimiento dinámica
          const nextUnpaid = installments.find(
            (inst) => inst.status !== InstallmentStatus.PAID,
          );
          if (nextUnpaid && !isFullySettled) {
            // Asignar progresivamente la fecha solo a la siguiente cuota si no la tenía asignada
            if (!nextUnpaid.dueDate) {
              const approvalDate = new Date();
              const nextDate = new Date(approvalDate);
              const intervalValue = order.installmentIntervalValue || 7;
              const intervalUnit =
                order.installmentIntervalUnit || InstallmentPeriod.DAYS;

              if (intervalUnit === InstallmentPeriod.DAYS) {
                nextDate.setDate(approvalDate.getDate() + intervalValue);
              } else if (intervalUnit === InstallmentPeriod.WEEKS) {
                nextDate.setDate(approvalDate.getDate() + intervalValue * 7);
              } else if (intervalUnit === InstallmentPeriod.MONTHS) {
                nextDate.setMonth(approvalDate.getMonth() + intervalValue);
              }
              nextUnpaid.dueDate = nextDate;
              await queryRunner.manager.save(nextUnpaid);

              const nextIndex = installments.indexOf(nextUnpaid) + 1;
              nextInstallmentForNotification = {
                index: nextIndex,
                amount: parseFloat(nextUnpaid.amount.toString()),
                dueDate: nextDate,
              };
            }
            order.nextDueDate = nextUnpaid.dueDate;
          } else {
            order.nextDueDate = null;
          }
        }

        if (order.remainingBalance === 0) {
          order.status = OrderStatus.FULLY_PAID;
          order.nextDueDate = null;
          order.isFullyPaid = true;

          if (order.isPartialPayment) {
            const allInsts = await queryRunner.manager.find(Installment, {
              where: { order: { id: order.id } },
            });
            for (const inst of allInsts) {
              if (inst.status !== InstallmentStatus.PAID) {
                inst.status = InstallmentStatus.PAID;
                inst.paidAmount = inst.amount;
                await queryRunner.manager.save(inst);
              }
            }
          }
        } else {
          order.status = OrderStatus.PARTIALLY_PAID;
          order.isFullyPaid = false;

          if (!order.isPartialPayment) {
            const now = new Date();
            const nextDate = new Date();
            const intervalValue = order.installmentIntervalValue || 1;
            const intervalUnit =
              order.installmentIntervalUnit || InstallmentPeriod.DAYS;

            if (intervalUnit === InstallmentPeriod.DAYS) {
              nextDate.setDate(now.getDate() + intervalValue);
            } else if (intervalUnit === InstallmentPeriod.WEEKS) {
              nextDate.setDate(now.getDate() + intervalValue * 7);
            } else if (intervalUnit === InstallmentPeriod.MONTHS) {
              nextDate.setMonth(now.getMonth() + intervalValue);
            }
            order.nextDueDate = nextDate;
          }
        }

        // Acumular deuda de comisión para la tienda si la orden tiene comisión
        const commAmount = parseFloat(
          order.platformCommissionAmount?.toString() || '0',
        );
        if (commAmount > 0 && !order.isCommissionVoided && store) {
          let commToAdd = 0;
          if (!order.isPartialPayment) {
            commToAdd = commAmount;
          } else {
            const approvedBefore = (order.payments || []).filter(
              (p) => p.status === PaymentStatus.APPROVED && p.id !== paymentId,
            ).length;
            const maxInst = parseInt(store.maxInstallments?.toString() || '1');
            const perInstComm =
              maxInst > 0 ? Math.round((commAmount / maxInst) * 100) / 100 : 0;
            const isLastInst = approvedBefore + 1 >= maxInst;
            commToAdd = isLastInst
              ? Math.round((commAmount - perInstComm * (maxInst - 1)) * 100) /
                100
              : perInstComm;
          }

          if (commToAdd > 0) {
            const currentDebt = parseFloat(
              store.accumulatedCommissionDebt?.toString() || '0',
            );
            store.accumulatedCommissionDebt =
              Math.round((currentDebt + commToAdd) * 100) / 100;
            await queryRunner.manager.save(store);
          }
        }

        await queryRunner.manager.save(order);

        // Anti-Fraude: redención por compra aprobada (Regla 3x3)
        const customerUser = payment.user || payment.order?.user;
        if (customerUser) {
          await this.handleFraudRedemptionOnPaymentApproval(
            customerUser.id,
            queryRunner.manager,
          );
        }
      } else if (newStatus === PaymentStatus.REJECTED) {
        payment.rejectionReason = rejectionReason || null;
        // En caso de rechazo, el stock permanece reservado para la orden.
        // Si la orden no tiene ningún pago aprobado previo, marcar la orden en estado REJECTED.
        const orderForRejection = await queryRunner.manager.findOne(Order, {
          where: { id: payment.order.id },
          relations: ['payments', 'store'],
        });
        if (orderForRejection) {
          const approvedCount = (orderForRejection.payments || []).filter(
            (p) => p.status === PaymentStatus.APPROVED,
          ).length;
          if (
            approvedCount === 0 &&
            orderForRejection.status !== OrderStatus.CANCELLED
          ) {
            orderForRejection.status = OrderStatus.REJECTED;
            await queryRunner.manager.save(orderForRejection);
            await this.commissionService.voidOrderCommission(
              orderForRejection,
              queryRunner.manager,
            );

            // Liberar reservas de turnos agendados para que el horario quede disponible inmediatamente
            const slotBookings = await queryRunner.manager.find(
              OrderSlotBooking,
              {
                where: {
                  order: { id: orderForRejection.id },
                  status: In([
                    SlotBookingStatus.CONFIRMED,
                    SlotBookingStatus.HOLD,
                  ]),
                },
              },
            );
            for (const sb of slotBookings) {
              sb.status = SlotBookingStatus.CANCELLED;
              await queryRunner.manager.save(sb);
            }
          }
        }

        // Anti-Fraude: evaluar rechazo de pago consecutivo
        if (!bypassFraudPenalty) {
          const customerUser = payment.user || payment.order?.user;
          if (customerUser) {
            await this.handleFraudPenaltyOnPaymentRejection(
              customerUser.id,
              queryRunner.manager,
            );
          }
        }
      } else if (
        newStatus === PaymentStatus.REFUNDED ||
        newStatus === PaymentStatus.REFUND_PENDING
      ) {
        payment.rejectionReason =
          rejectionReason || 'Reembolso procesado por el comercio';
        if (receiptImage) {
          payment.receiptImage = receiptImage;
        }
      }

      payment.status = newStatus;
      const savedPayment = await queryRunner.manager.save(payment);
      await queryRunner.commitTransaction();

      // Registro de auditoría de actividad
      if (payment.store?.company?.id) {
        let action = 'PAYMENT_VERIFIED';
        let description = `Pago #${payment.id.split('-')[0].toUpperCase()} por $${payment.amount} verificado (${newStatus})`;

        if (newStatus === PaymentStatus.APPROVED) {
          action = 'INSTALLMENT_PAYMENT_APPROVED';
          description = `Pago #${payment.id.split('-')[0].toUpperCase()} por $${payment.amount} aprobado para la orden #${payment.order?.id?.split('-')[0]?.toUpperCase() || ''}`;
        } else if (newStatus === PaymentStatus.REJECTED) {
          action = 'INSTALLMENT_PAYMENT_REJECTED';
          description = `Pago #${payment.id.split('-')[0].toUpperCase()} por $${payment.amount} rechazado. Motivo: ${payment.rejectionReason || 'No especificado'}`;
        } else if (
          newStatus === PaymentStatus.REFUNDED ||
          newStatus === PaymentStatus.REFUND_PENDING
        ) {
          action = 'PAYMENT_REFUND_PROCESSED';
          description = `Reembolso procesado para el pago #${payment.id.split('-')[0].toUpperCase()} por $${payment.amount}`;
        }

        this.activityLogService.log({
          companyId: payment.store.company.id,
          storeId: payment.store.id,
          actor: actor || { id: storeOwnerId },
          module: ActivityLogModule.INSTALLMENTS,
          action,
          description,
          entityType: 'payment',
          entityId: payment.id,
          metadata: {
            orderId: payment.order?.id,
            amount: payment.amount,
            newStatus,
            rejectionReason: payment.rejectionReason,
          },
        });
      }
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }

    // Side effects outside database transaction
    if (payment) {
      if (newStatus === PaymentStatus.APPROVED) {
        this.mailService
          .sendPaymentApproved(
            payment,
            nextInstallmentForNotification,
            payment.order.balance,
          )
          .catch((err: unknown) => {
            const msg = err instanceof Error ? err.message : String(err);
            this.logger.error(`Error sending payment approved email: ${msg}`);
          });
      } else if (newStatus === PaymentStatus.REJECTED) {
        this.mailService.sendPaymentRejected(payment).catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          this.logger.error(`Error sending payment rejected email: ${msg}`);
        });
      }

      // Notificar al cliente sobre el resultado de la verificación
      try {
        const isRefundPending = newStatus === PaymentStatus.REFUND_PENDING;
        const isRefunded = newStatus === PaymentStatus.REFUNDED;
        const statusText =
          newStatus === PaymentStatus.APPROVED
            ? 'aprobado'
            : isRefundPending
              ? 'reembolso emitido (por verificar)'
              : isRefunded
                ? 'reembolsado'
                : 'rechazado';

        const notificationTitle = isRefundPending
          ? 'Reembolso emitido por la tienda'
          : `Pago ${statusText}`;

        const notificationBody = isRefundPending
          ? `La tienda ha emitido el reembolso de tu pago por $${payment.amount} para la orden #${payment.order.id.split('-')[0].toUpperCase()}. Ref/Detalle: "${payment.rejectionReason || 'Reembolso emitido'}". Por favor verifica tu cuenta y confirma la recepción.`
          : isRefunded
            ? `Tu pago de $${payment.amount} para la orden #${payment.order.id.split('-')[0].toUpperCase()} ha sido confirmado como reembolsado.`
            : newStatus === PaymentStatus.REJECTED && payment.rejectionReason
              ? `Tu pago de $${payment.amount} para la orden #${payment.order.id.split('-')[0].toUpperCase()} ha sido rechazado: "${payment.rejectionReason}".`
              : `Tu pago de $${payment.amount} para la orden #${payment.order.id.split('-')[0].toUpperCase()} ha sido ${statusText}.`;

        await this.notificationService.create({
          userId: payment.user.id,
          title: notificationTitle,
          body: notificationBody,
          type: isRefundPending
            ? NotificationType.REFUND_REPORTED
            : isRefunded
              ? NotificationType.REFUND_CONFIRMED
              : newStatus === PaymentStatus.APPROVED
                ? NotificationType.PAYMENT_APPROVED
                : NotificationType.PAYMENT_REJECTED,
          targetId: payment.order.id,
        });

        // Si hay una siguiente cuota programada, enviar notificación push en la app
        if (
          newStatus === PaymentStatus.APPROVED &&
          nextInstallmentForNotification &&
          store
        ) {
          await this.notificationService.create({
            userId: payment.user.id,
            title: `Próxima Cuota Programada`,
            body: `Tu Cuota #${nextInstallmentForNotification.index} por $${nextInstallmentForNotification.amount.toFixed(2)} vence el ${nextInstallmentForNotification.dueDate?.toLocaleDateString('es-VE') || ''}.`,
            type: NotificationType.GENERAL,
            orderId: payment.order.id,
          });
        }

        // Notificar a la tienda para actualización reactiva en tiempo real
        if (store?.id) {
          this.notificationService.notifyStoreInstallmentsUpdated(store.id, {
            orderId: payment.order.id,
            paymentId: payment.id,
            status: newStatus,
          });
        }

        // Si la orden pasa a FULLY_PAID, cerrar sala de chat y notificar para calificación
        if (payment.order.status === OrderStatus.FULLY_PAID) {
          this.notificationService.closeChatRoom(payment.order.id, 'approved');
          // Disparar notificaciones de calificación
          const orderWithOwner = await this.orderRepository.findOne({
            where: { id: payment.order.id },
            relations: ['user', 'store', 'store.owner'],
          });
          if (orderWithOwner) {
            try {
              if (orderWithOwner.user?.id) {
                this.notificationService.create({
                  userId: orderWithOwner.user.id,
                  title: '\u2B50 \u00bfC\u00f3mo estuvo tu compra?',
                  body: 'Tu orden ha sido completada. \u00a1Deja tu calificaci\u00f3n!',
                  type: NotificationType.ORDER_REVIEW_PROMPT,
                  orderId: orderWithOwner.id,
                  targetId: orderWithOwner.id,
                });
              }
              if (orderWithOwner.store?.owner?.id) {
                this.notificationService.create({
                  userId: orderWithOwner.store.owner.id,
                  storeId: orderWithOwner.store.id,
                  title: '\u{1F464} Califica a tu comprador',
                  body: 'Una orden fue completada. Puedes calificar al cliente.',
                  type: NotificationType.BUYER_REVIEW_PROMPT,
                  orderId: orderWithOwner.id,
                  targetId: orderWithOwner.id,
                });
              }
            } catch (reviewErr) {
              this.logger.error(
                `Error sending review prompt notifications: ${reviewErr}`,
              );
            }
          }
        }
      } catch (notifyErr: unknown) {
        const msg =
          notifyErr instanceof Error ? notifyErr.message : String(notifyErr);
        this.logger.error(
          `Error notifying customer on payment verification: ${msg}`,
        );
      }
    }

    return payment;
  }

  private async handleFraudPenaltyOnPaymentRejection(
    userId: string,
    manager: EntityManager,
  ) {
    const isEnabled =
      await this.platformSettingsService.isFraudPenaltyEnabled();
    if (!isEnabled) return;

    const user = await manager.findOne(User, { where: { id: userId } });
    if (!user) return;

    const resetDays =
      await this.platformSettingsService.getConsecutiveResetDays();
    const maxRejections =
      await this.platformSettingsService.getMaxConsecutiveRejections();
    const suspensionDays =
      await this.platformSettingsService.getSuspensionDurationDays();

    const now = new Date();

    // Check decay: if lastRejectedPaymentAt exists and is older than resetDays, reset counter to 0
    if (user.lastRejectedPaymentAt) {
      const diffMs =
        now.getTime() - new Date(user.lastRejectedPaymentAt).getTime();
      const diffDays = diffMs / (1000 * 60 * 60 * 24);
      if (diffDays >= resetDays) {
        user.consecutiveRejectedPaymentsCount = 0;
      }
    }

    user.consecutiveRejectedPaymentsCount =
      (Number(user.consecutiveRejectedPaymentsCount) || 0) + 1;
    user.lastRejectedPaymentAt = now;
    user.consecutiveApprovedPaymentsCount = 0;

    if (user.consecutiveRejectedPaymentsCount >= maxRejections) {
      const suspendedUntil = new Date(
        now.getTime() + suspensionDays * 24 * 60 * 60 * 1000,
      );
      user.accountSuspendedUntil = suspendedUntil;
      user.accountSuspensionReason = `Suspensión automática por acumular ${user.consecutiveRejectedPaymentsCount} reportes consecutivos de pagos no verificados o rechazados.`;
      this.logger.warn(
        `User ${user.id} has been suspended until ${suspendedUntil.toISOString()} due to ${user.consecutiveRejectedPaymentsCount} consecutive rejected payments.`,
      );
    }

    await manager.save(User, user);
  }

  private async handleFraudRedemptionOnPaymentApproval(
    userId: string,
    manager: EntityManager,
  ) {
    const isEnabled =
      await this.platformSettingsService.isFraudPenaltyEnabled();
    if (!isEnabled) return;

    const user = await manager.findOne(User, { where: { id: userId } });
    if (!user) return;

    const resetDays =
      await this.platformSettingsService.getConsecutiveResetDays();
    const now = new Date();

    // Check decay on rejection counter
    if (user.lastRejectedPaymentAt) {
      const diffMs =
        now.getTime() - new Date(user.lastRejectedPaymentAt).getTime();
      const diffDays = diffMs / (1000 * 60 * 60 * 24);
      if (diffDays >= resetDays) {
        user.consecutiveRejectedPaymentsCount = 0;
        user.lastRejectedPaymentAt = null;
      }
    }

    user.consecutiveApprovedPaymentsCount =
      (Number(user.consecutiveApprovedPaymentsCount) || 0) + 1;

    // Regla 3x3: 3 compras consecutivas aprobadas resetean los rechazos
    if (user.consecutiveApprovedPaymentsCount >= 3) {
      user.consecutiveRejectedPaymentsCount = 0;
      user.lastRejectedPaymentAt = null;
      user.consecutiveApprovedPaymentsCount = 0;
    }

    await manager.save(User, user);
  }

  async create(createPaymentDto: CreatePaymentDto, userId: string) {
    const { orderId, amount, storeId } = createPaymentDto;
    if (!orderId) {
      throw new BadRequestException('El ID de la orden es obligatorio');
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    let savedPayment: Payment | null = null;
    let order: Order | null = null;
    let orderWithRelations: Order | null = null;
    let store: Store | null = null;
    let incomingAmount = 0;

    try {
      // 1. Bloquear la orden para edición
      order = await queryRunner.manager.findOne(Order, {
        where: { id: orderId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!order)
        throw new NotFoundException(`Orden #${orderId} no encontrada`);

      orderWithRelations = await queryRunner.manager.findOne(Order, {
        where: { id: orderId },
        relations: [
          'payments',
          'user',
          'orderItems',
          'orderItems.item',
          'store',
        ],
      });

      if (!orderWithRelations)
        throw new NotFoundException(`Orden #${orderId} no encontrada`);

      if (orderWithRelations.user.id !== userId) {
        throw new BadRequestException(
          'No tienes permiso para realizar pagos a esta orden',
        );
      }

      const user = await queryRunner.manager.findOne(User, {
        where: { id: userId },
      });
      if (!user)
        throw new NotFoundException(`Usuario #${userId} no encontrado`);

      store = await queryRunner.manager.findOne(Store, {
        where: { id: storeId },
        relations: ['company', 'company.owner', 'owner'],
      });
      if (!store)
        throw new NotFoundException(`Tienda #${storeId} no encontrada`);

      if (orderWithRelations.isPartialPayment) {
        const approvedPaymentsCount = orderWithRelations.payments.filter(
          (p) => p.status === PaymentStatus.APPROVED,
        ).length;
        const maxAllowed = parseInt(store.maxInstallments?.toString() || '0');

        if (maxAllowed > 0 && approvedPaymentsCount >= maxAllowed) {
          throw new BadRequestException(
            `Se ha alcanzado el límite de ${maxAllowed} cuotas para esta orden`,
          );
        }
      }

      const currentBalance = parseFloat(orderWithRelations.balance.toString());
      incomingAmount = parseFloat(amount.toString());
      if (incomingAmount > currentBalance + 0.01) {
        throw new BadRequestException(
          `El monto excede el balance pendiente ($${currentBalance})`,
        );
      }

      // Validación del monto mínimo requerido para cuotas 2+ al reportar pago
      if (orderWithRelations.isPartialPayment) {
        const approvedPayments = orderWithRelations.payments.filter(
          (p) => p.status === PaymentStatus.APPROVED,
        );
        if (approvedPayments.length > 0) {
          const installments = await queryRunner.manager.find(Installment, {
            where: { order: { id: orderId } },
            order: { dueDate: 'ASC' },
          });
          const nextPending = installments.find(
            (inst) => inst.status !== InstallmentStatus.PAID,
          );
          if (nextPending) {
            const instAmount = parseFloat(nextPending.amount.toString());
            const instLateFee = parseFloat(
              nextPending.lateFeeApplied.toString(),
            );
            const instPaid = parseFloat(
              (nextPending.paidAmount || 0).toString(),
            );
            let minRequired = instAmount + instLateFee - instPaid;
            if (minRequired > currentBalance) {
              minRequired = currentBalance;
            }
            const incomingCents = Math.round(incomingAmount * 100);
            const minRequiredCents = Math.round(minRequired * 100);
            const cuotaIndex = installments.indexOf(nextPending) + 1;

            if (incomingCents < minRequiredCents - 1) {
              throw new BadRequestException(
                `El pago ($${incomingAmount.toFixed(2)}) es menor al mínimo requerido para la Cuota ${cuotaIndex} ($${minRequired.toFixed(2)}). No se permiten abonos parciales.`,
              );
            }
          }
        }
      }

      const { reference } = createPaymentDto;
      if (reference) {
        const existingPayment = await queryRunner.manager.findOne(Payment, {
          where: {
            reference,
            store: { id: storeId },
          },
        });
        if (existingPayment) {
          throw new BadRequestException(
            `La referencia bancaria "${reference}" ya ha sido utilizada en esta tienda.`,
          );
        }
      }

      let installmentIndex: number | null = null;
      if (orderWithRelations.isPartialPayment) {
        const installments = await queryRunner.manager.find(Installment, {
          where: { order: { id: orderId } },
          order: { dueDate: 'ASC' },
        });
        const nextPending = installments.find(
          (inst) => inst.status !== InstallmentStatus.PAID,
        );
        if (nextPending) {
          installmentIndex = installments.indexOf(nextPending) + 1;
        }
      }

      const payment = queryRunner.manager.create(Payment, {
        ...createPaymentDto,
        order,
        user,
        store,
        status: PaymentStatus.WAITING_VERIFICATION,
        installmentIndex,
      });

      savedPayment = await queryRunner.manager.save(payment);

      if (order.status === OrderStatus.REJECTED) {
        const approvedCount = (orderWithRelations.payments || []).filter(
          (p) => p.status === PaymentStatus.APPROVED,
        ).length;
        order.status =
          approvedCount > 0 ? OrderStatus.PARTIALLY_PAID : OrderStatus.PENDING;
        await queryRunner.manager.save(order);
      }

      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }

    // Side effects outside database transaction
    if (orderWithRelations && !orderWithRelations.isPartialPayment) {
      this.mailService
        .sendSinglePaymentUnderReview(orderWithRelations, incomingAmount)
        .catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          this.logger.error(`Error sending payment under review email: ${msg}`);
        });
    }

    // Notificar al dueño de la tienda que se reportó un pago
    try {
      if (store && orderWithRelations && order) {
        const ownerId = store.owner?.id || store.company?.owner?.id;
        if (ownerId) {
          const totalItems = orderWithRelations.orderItems?.length || 0;
          const firstItem =
            orderWithRelations.orderItems[0]?.title || 'un producto';
          const additionalCount = totalItems - 1;
          const itemSuffix =
            additionalCount > 0
              ? ` y ${additionalCount} artículo${additionalCount > 1 ? 's' : ''} más`
              : '';
          const storeName = store.name;

          await this.notificationService.create({
            userId: ownerId,
            storeId: store.id,
            title: `¡Nueva Orden: ${firstItem}${itemSuffix}!`,
            body: `Se ha reportado un pago por '${firstItem}${itemSuffix}' en '${storeName}' por $${amount}.`,
            type: NotificationType.PAYMENT_REPORTED,
            orderId: order.id,
          });
          this.notificationService.notifyStoreInstallmentsUpdated(store.id, {
            orderId: order.id,
            paymentId: savedPayment?.id,
          });
        }
      }
    } catch (notifyErr: unknown) {
      const msg =
        notifyErr instanceof Error ? notifyErr.message : String(notifyErr);
      this.logger.error(
        `Error notifying store owner on payment creation: ${msg}`,
      );
    }

    return savedPayment;
  }

  async findAll(paginationDto: PaymentPaginationDto) {
    const {
      status,
      paymentMethod,
      currency,
      reference,
      storeId,
      userId,
      limit,
      offset,
      sort,
      order,
    } = paginationDto;

    const queryBuilder = this.paymentRepository
      .createQueryBuilder('payment')
      .leftJoinAndSelect('payment.order', 'order')
      .leftJoinAndSelect('payment.user', 'user')
      .leftJoinAndSelect('payment.store', 'store');

    if (status) {
      queryBuilder.andWhere('payment.status = :status', { status });
    }

    if (paymentMethod) {
      queryBuilder.andWhere('payment.paymentMethod = :paymentMethod', {
        paymentMethod,
      });
    }

    if (currency) {
      queryBuilder.andWhere('payment.currency = :currency', { currency });
    }

    if (reference) {
      queryBuilder.andWhere('payment.reference LIKE :reference', {
        reference: `%${reference}%`,
      });
    }

    if (storeId) {
      queryBuilder.andWhere('store.id = :storeId', { storeId });
    }

    if (userId) {
      queryBuilder.andWhere('user.id = :userId', { userId });
    }

    // Ordenamiento
    const validSortFields = ['createdAt', 'amount', 'status'];
    const sortField = validSortFields.includes(sort as string)
      ? `payment.${sort}`
      : 'payment.createdAt';
    queryBuilder.orderBy(sortField, order || 'DESC');

    queryBuilder.skip(offset).take(limit);

    const [items, total] = await queryBuilder.getManyAndCount();

    return {
      items,
      total,
      limit,
      offset,
    };
  }

  async findOne(id: string) {
    const payment = await this.paymentRepository.findOne({
      where: { id },
      relations: [
        'order',
        'user',
        'store',
        'store.company',
        'store.company.owner',
      ],
    });
    if (!payment) throw new NotFoundException(`Pago #${id} no encontrado`);
    return payment;
  }

  async update(id: string, updatePaymentDto: UpdatePaymentDto) {
    const payment = await this.findOne(id);
    this.paymentRepository.merge(payment, updatePaymentDto);
    return await this.paymentRepository.save(payment);
  }

  async remove(id: string) {
    const payment = await this.findOne(id);
    await this.paymentRepository.remove(payment);
    return { deleted: true };
  }

  async createWithOrder(dto: CreatePaymentWithOrderDto, userId: string) {
    const { order: orderDto, payment: paymentDto } = dto;

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    let savedPayment: Payment | null = null;
    let savedOrderId: string | null = null;
    let storeOwnerId: string | null = null;
    let storeName = '';
    let incomingAmount = 0;
    let firstItemTitle = 'un producto';
    let additionalItemsCount = 0;

    try {
      // 1. Validar Tienda
      const store = await queryRunner.manager.findOne(Store, {
        where: { id: orderDto.storeId },
        relations: ['owner', 'company', 'company.owner'],
      });
      if (!store) {
        throw new NotFoundException(
          `Tienda con ID ${orderDto.storeId} no encontrada`,
        );
      }
      if (store.status !== StoreStatus.ACTIVE) {
        throw new BadRequestException(
          `La tienda no está activa para recibir órdenes`,
        );
      }

      storeOwnerId = store.owner?.id || store.company?.owner?.id || null;
      storeName = store.name;

      // 2. Validar Cliente
      const user = await queryRunner.manager.findOne(User, {
        where: { id: userId },
      });
      if (!user) {
        throw new NotFoundException(`Usuario con ID ${userId} no encontrado`);
      }

      // Validar si el cliente está bloqueado por la tienda
      const isBlocked = await queryRunner.manager.findOne(StoreCustomerBlock, {
        where: { storeId: orderDto.storeId, customerId: userId },
      });
      if (isBlocked) {
        throw new ForbiddenException(
          'La tienda ha restringido las compras para tu cuenta. Puedes enviar una solicitud de mediación desde el perfil de la tienda.',
        );
      }

      // 3. Validar items duplicados (clave compuesta itemId:variantId)
      const compositeKeys = orderDto.items.map(
        (i) => `${i.itemId}:${i.variantId || 'base'}`,
      );
      const uniqueCompositeKeys = new Set(compositeKeys);
      if (uniqueCompositeKeys.size !== orderDto.items.length) {
        throw new BadRequestException(
          'La orden contiene items o variantes duplicadas. Por favor, agrupa las cantidades.',
        );
      }

      // Bloqueo por morosidad (Delinquent Lockout) y bloqueo por pago rechazado per-tienda
      const isPartialPayment = orderDto.isPartialPayment || false;
      if (isPartialPayment) {
        const hasOverdueInstallment = await queryRunner.manager.findOne(
          Installment,
          {
            where: {
              status: InstallmentStatus.OVERDUE,
              order: { user: { id: userId } },
            },
            relations: ['order', 'order.user'],
          },
        );

        if (hasOverdueInstallment) {
          throw new BadRequestException(
            'Su cuenta posee cuotas vencidas pendientes. Por favor regularice su saldo.',
          );
        }

        const hasRejectedInStore = await queryRunner.manager.findOne(Order, {
          where: {
            user: { id: userId },
            store: { id: orderDto.storeId },
            status: In([OrderStatus.PENDING, OrderStatus.REJECTED]),
            payments: { status: PaymentStatus.REJECTED },
          },
          relations: ['payments'],
        });

        if (hasRejectedInStore) {
          throw new BadRequestException(
            'Tienes un pago rechazado pendiente de resolver en esta tienda. Por favor regulariza tu orden anterior antes de realizar una nueva compra en cuotas.',
          );
        }
      }

      let subtotal = 0;
      const orderItemsToSave: OrderItem[] = [];

      // 4. Procesar items y validar stock con bloqueo pesimista
      for (const itemDto of orderDto.items) {
        // Bloqueo pesimista sobre la tabla base sin LEFT JOINs
        await queryRunner.manager.findOne(Item, {
          where: { id: itemDto.itemId },
          lock: { mode: 'pessimistic_write' },
        });

        // Cargar entidad con relaciones completas
        const item = await queryRunner.manager.findOne(Item, {
          where: { id: itemDto.itemId },
          relations: [
            'store',
            'customizationGroupsRel',
            'customizationGroupsRel.options',
          ],
        });
        if (!item) {
          throw new NotFoundException(
            `Item con ID ${itemDto.itemId} no encontrado`,
          );
        }

        if (item.store.id !== orderDto.storeId) {
          throw new BadRequestException(
            `El item "${item.title}" no pertenece a la tienda seleccionada. Solo puedes ordenar items de una misma tienda.`,
          );
        }

        // Manejo y validación de Variante
        let variant: ItemVariant | undefined;
        let variantLabel: string | undefined;

        if (item.hasVariants) {
          if (!itemDto.variantId) {
            throw new BadRequestException(
              `Debes seleccionar una variante para el artículo "${item.title}".`,
            );
          }
          variant =
            (await queryRunner.manager.findOne(ItemVariant, {
              where: { id: itemDto.variantId, item: { id: item.id } },
            })) ?? undefined;

          if (!variant || !variant.isActive) {
            throw new BadRequestException(
              `La variante seleccionada para "${item.title}" no está disponible o no existe.`,
            );
          }
          variantLabel = Object.values(variant.axisValues || {})
            .map((v: any) =>
              typeof v === 'string' && v.includes('|') ? v.split('|')[0] : v,
            )
            .join(' / ');
        }

        // Comprobar inventario y deducción atómica
        if (item.trackInventory) {
          if (item.hasVariants && variant) {
            const currentStock = parseFloat(
              variant.stockQuantity?.toString() || '0',
            );
            if (currentStock < itemDto.quantity) {
              throw new BadRequestException(
                `Stock insuficiente para la variante (${variantLabel || 'seleccionada'}) de "${item.title}". Disponible: ${currentStock}`,
              );
            }
            const updateResult = await queryRunner.manager
              .createQueryBuilder()
              .update(ItemVariant)
              .set({
                stockQuantity: () => `stockQuantity - ${itemDto.quantity}`,
              })
              .where('id = :variantId AND stockQuantity >= :quantity', {
                variantId: variant.id,
                quantity: itemDto.quantity,
              })
              .execute();

            if (updateResult.affected === 0) {
              throw new BadRequestException(
                `Stock insuficiente para la variante (${variantLabel || 'seleccionada'}) de "${item.title}".`,
              );
            }
          } else {
            const currentStock = parseFloat(
              item.stockQuantity?.toString() || '0',
            );
            if (currentStock < itemDto.quantity) {
              throw new BadRequestException(
                `Stock insuficiente para "${item.title}". Disponible: ${currentStock}`,
              );
            }
            const updateResult = await queryRunner.manager
              .createQueryBuilder()
              .update(Item)
              .set({
                stockQuantity: () => `stockQuantity - ${itemDto.quantity}`,
              })
              .where('id = :itemId AND stockQuantity >= :quantity', {
                itemId: item.id,
                quantity: itemDto.quantity,
              })
              .execute();

            if (updateResult.affected === 0) {
              throw new BadRequestException(
                `Stock insuficiente para "${item.title}".`,
              );
            }
          }
        }

        if (item.customizationGroupsRel) {
          for (const group of item.customizationGroupsRel) {
            const selectedOptIds = itemDto.selectedOptions?.[group.id] || [];
            const requiredMin = group.minSelect * itemDto.quantity;
            const requiredMax = group.maxSelect * itemDto.quantity;

            if (group.minSelect > 0 && selectedOptIds.length < requiredMin) {
              throw new BadRequestException(
                `Debes seleccionar al menos ${requiredMin} opción(es) para "${group.name}"`,
              );
            }
            if (group.maxSelect > 0 && selectedOptIds.length > requiredMax) {
              throw new BadRequestException(
                `Puedes seleccionar como máximo ${requiredMax} opción(es) para "${group.name}"`,
              );
            }

            if (group.options) {
              for (const opt of group.options) {
                const optCount = selectedOptIds.filter(
                  (id) => id === opt.id,
                ).length;
                if (optCount > 0) {
                  if (opt.minQuantity > 0 && optCount < opt.minQuantity) {
                    throw new BadRequestException(
                      `Debes seleccionar al menos ${opt.minQuantity} de "${opt.name}"`,
                    );
                  }
                  if (opt.maxQuantity > 0 && optCount > opt.maxQuantity) {
                    throw new BadRequestException(
                      `Puedes seleccionar como máximo ${opt.maxQuantity} de "${opt.name}"`,
                    );
                  }
                }
              }
            }
          }
        }

        let customizationExtra = 0;
        if (itemDto.selectedOptions && item.customizationGroupsRel) {
          for (const [groupId, optionIds] of Object.entries(
            itemDto.selectedOptions,
          )) {
            const group = item.customizationGroupsRel.find(
              (g) => g.id === groupId,
            );
            if (group && group.options) {
              const optionCounts: Record<string, number> = {};
              for (const optId of optionIds) {
                optionCounts[optId] = (optionCounts[optId] || 0) + 1;
              }

              for (const [optId, selectedQty] of Object.entries(optionCounts)) {
                const opt = group.options.find((o) => o.id === optId);
                if (opt) {
                  const defaultQty = opt.defaultQuantity || 0;
                  const chargeableQty = Math.max(
                    0,
                    selectedQty - defaultQty * itemDto.quantity,
                  );
                  customizationExtra +=
                    chargeableQty * parseFloat(opt.price.toString() || '0');
                }
              }
            }
          }
        }

        // Determinar precio base (prioridad a variant si tiene variantes, sustitutivo NO aditivo)
        let basePrice: number;
        if (item.hasVariants && variant) {
          const vDiscount =
            variant.discountPrice !== null &&
            variant.discountPrice !== undefined
              ? parseFloat(variant.discountPrice.toString())
              : null;
          const vPrice =
            variant.price !== null && variant.price !== undefined
              ? parseFloat(variant.price.toString())
              : parseFloat(item.price.toString());
          basePrice =
            vDiscount !== null && vDiscount < vPrice ? vDiscount : vPrice;
        } else {
          basePrice = item.discountPrice
            ? parseFloat(item.discountPrice.toString())
            : parseFloat(item.price.toString());
        }

        const totalLinePrice =
          basePrice * itemDto.quantity + customizationExtra;
        const priceAtOrder =
          itemDto.quantity > 0
            ? totalLinePrice / itemDto.quantity
            : totalLinePrice;

        subtotal = Math.round((subtotal + totalLinePrice) * 100) / 100;

        const orderItem = queryRunner.manager.create(OrderItem, {
          item,
          title: item.title,
          quantity: itemDto.quantity,
          price: priceAtOrder,
          selectedOptions: itemDto.selectedOptions,
          variantId: item.hasVariants ? variant?.id : undefined,
          variantLabel: item.hasVariants ? variantLabel : undefined,
          variant: item.hasVariants ? variant : undefined,
        });
        orderItemsToSave.push(orderItem);
      }

      // 5. Cargo por pagos parciales
      let feeAmount = 0;
      if (isPartialPayment) {
        if (!store.allowPartialPayments) {
          throw new BadRequestException(
            'Esta tienda no admite pagos parciales',
          );
        }

        const requestedValue = orderDto.installmentIntervalValue;
        const requestedUnit = orderDto.installmentIntervalUnit;

        if (
          store.installmentFrequencyOptions &&
          store.installmentFrequencyOptions.length > 0
        ) {
          if (!requestedValue || !requestedUnit) {
            throw new BadRequestException(
              'Debes seleccionar una frecuencia de pago para el pago parcial',
            );
          }

          const isValidFrequency = store.installmentFrequencyOptions.some(
            (opt) => opt.value === requestedValue && opt.unit === requestedUnit,
          );

          if (!isValidFrequency) {
            throw new BadRequestException(
              'La frecuencia de pago seleccionada no está disponible para esta tienda',
            );
          }
        } else {
          if (
            requestedValue !== undefined &&
            store.installmentIntervalValue &&
            requestedValue !== store.installmentIntervalValue
          ) {
            throw new BadRequestException(
              'La frecuencia de pago seleccionada no coincide con la configuración de la tienda',
            );
          }
          if (
            requestedUnit !== undefined &&
            store.installmentIntervalUnit &&
            requestedUnit !== store.installmentIntervalUnit
          ) {
            throw new BadRequestException(
              'La frecuencia de pago seleccionada no coincide con la configuración de la tienda',
            );
          }
        }

        const feePercent = parseFloat(
          store.partialPaymentsFeePercentage.toString(),
        );
        feeAmount = Math.round(((subtotal * feePercent) / 100) * 100) / 100;
      }

      const storeTotal = Math.round((subtotal + feeAmount) * 100) / 100;

      // 5.1 Cálculo de Comisión de la Plataforma
      const { rate: commRate, commissionAmount: commAmount } =
        await this.commissionService.calculateCommission(
          storeTotal,
          isPartialPayment,
          store,
        );

      const finalAmount = Math.round((storeTotal + commAmount) * 100) / 100;

      // 6. Crear Orden
      const order = queryRunner.manager.create(Order, {
        store,
        user,
        totalAmount: subtotal,
        feeAmount,
        platformCommissionRate: commRate,
        platformCommissionAmount: commAmount,
        finalAmount,
        balance: finalAmount,
        isPartialPayment,
        status: OrderStatus.PENDING,
      });

      if (isPartialPayment) {
        const intervalValue =
          orderDto.installmentIntervalValue ||
          store.installmentIntervalValue ||
          7;
        const intervalUnit =
          orderDto.installmentIntervalUnit ||
          store.installmentIntervalUnit ||
          InstallmentPeriod.DAYS;

        order.installmentIntervalValue = intervalValue;
        order.installmentIntervalUnit = intervalUnit;

        order.nextDueDate = new Date();
        order.remainingBalance = finalAmount;
        order.totalPaidAmount = 0;
        order.isFullyPaid = false;
      }

      const savedOrder = await queryRunner.manager.save(order);

      // 7. Guardar ítems de orden
      for (const oi of orderItemsToSave) {
        oi.order = savedOrder;
        await queryRunner.manager.save(oi);
      }

      // 7.1 Confirmar y asociar el turno agendado (por hold previo o por creación directa al ordenar)
      let resolvedSlotId = orderDto.timeSlotId;
      let resolvedBookingDate = orderDto.bookingDate;

      if (!resolvedSlotId || !resolvedBookingDate) {
        for (const itemDto of orderDto.items) {
          if (itemDto.timeSlotId && itemDto.bookingDate) {
            resolvedSlotId = itemDto.timeSlotId;
            resolvedBookingDate = itemDto.bookingDate;
            break;
          }
        }
      }

      if (orderDto.bookingSlotHoldId) {
        const slotBooking = await queryRunner.manager.findOne(
          OrderSlotBooking,
          {
            where: { id: orderDto.bookingSlotHoldId },
          },
        );
        if (slotBooking) {
          slotBooking.status = SlotBookingStatus.CONFIRMED;
          slotBooking.order = savedOrder;
          slotBooking.orderId = savedOrder.id;
          await queryRunner.manager.save(slotBooking);
        }
      } else if (resolvedSlotId && resolvedBookingDate) {
        const slot = await queryRunner.manager.findOne(ItemTimeSlot, {
          where: { id: resolvedSlotId },
          relations: ['slotConfig'],
        });

        if (slot && slot.isActive) {
          const maxCapacity = slot.slotConfig?.maxConcurrentBookings || 1;

          const confirmedCount = await queryRunner.manager.count(
            OrderSlotBooking,
            {
              where: {
                timeSlotId: slot.id,
                bookingDate: resolvedBookingDate,
                status: SlotBookingStatus.CONFIRMED,
              },
            },
          );

          const activeHoldsCount = await queryRunner.manager.count(
            OrderSlotBooking,
            {
              where: {
                timeSlotId: slot.id,
                bookingDate: resolvedBookingDate,
                status: SlotBookingStatus.HOLD,
                lockedUntil: MoreThan(new Date()),
              },
            },
          );

          if (confirmedCount + activeHoldsCount >= maxCapacity) {
            throw new ConflictException(
              `El horario seleccionado (${slot.startTime} - ${slot.endTime}) para la fecha ${resolvedBookingDate} ya no tiene cupos disponibles.`,
            );
          }

          const confirmedBooking = queryRunner.manager.create(
            OrderSlotBooking,
            {
              bookingDate: resolvedBookingDate,
              slotStartTime: slot.startTime,
              slotEndTime: slot.endTime,
              slotLabel: slot.label,
              status: SlotBookingStatus.CONFIRMED,
              timeSlot: slot,
              timeSlotId: slot.id,
              customer: user,
              customerId: user.id,
              store,
              storeId: store.id,
              order: savedOrder,
              orderId: savedOrder.id,
            },
          );

          await queryRunner.manager.save(OrderSlotBooking, confirmedBooking);
        }
      }

      // 8. Cuotas (Generación progresiva: solo cuota 1 con fecha hoy, el resto null)
      if (isPartialPayment) {
        const maxInstallments = parseInt(
          store.maxInstallments?.toString() || '1',
        );
        const minInitialPercent = parseFloat(
          store.minInitialPaymentPercentage?.toString() || '0',
        );

        const initialAmount =
          Math.round(((finalAmount * minInitialPercent) / 100) * 100) / 100;

        // [Fix 1] Validar que el monto del pago inicial cubra el mínimo requerido por la tienda
        const incomingAmountForValidation = parseFloat(
          paymentDto.amount.toString(),
        );
        const incomingCents = Math.round(incomingAmountForValidation * 100);
        const initialAmountCents = Math.round(initialAmount * 100);

        if (incomingCents < initialAmountCents - 1) {
          throw new BadRequestException(
            `El pago inicial ($${incomingAmountForValidation.toFixed(2)}) es menor al mínimo requerido (${initialAmount.toFixed(2)}) — ${minInitialPercent}% de ${finalAmount.toFixed(2)}`,
          );
        }

        const remainingAmount = finalAmount - initialAmount;
        const otherInstallmentsCount = maxInstallments - 1;
        const monthlyAmount =
          otherInstallmentsCount > 0
            ? Math.round((remainingAmount / otherInstallmentsCount) * 100) / 100
            : 0;

        const installmentsToSave: Installment[] = [];
        const now = new Date();

        const perInstallmentCommission =
          maxInstallments > 0
            ? Math.round((commAmount / maxInstallments) * 100) / 100
            : 0;

        const initialStoreAmount =
          Math.round((initialAmount - perInstallmentCommission) * 100) / 100;

        // Cuota 1: Inicial (Vence hoy)
        installmentsToSave.push(
          queryRunner.manager.create(Installment, {
            order: savedOrder,
            amount: initialAmount,
            storePrincipalAmount: initialStoreAmount,
            platformCommissionPortion: perInstallmentCommission,
            dueDate: now,
            status: InstallmentStatus.PENDING,
          }),
        );

        // Cuotas restantes: dueDate inicializado en NULL hasta que se confirme la cuota anterior
        for (let i = 1; i < maxInstallments; i++) {
          const isLast = i === maxInstallments - 1;
          const instCommission = isLast
            ? Math.round(
                (commAmount -
                  perInstallmentCommission * (maxInstallments - 1)) *
                  100,
              ) / 100
            : perInstallmentCommission;
          const instStoreAmount =
            Math.round((monthlyAmount - instCommission) * 100) / 100;

          installmentsToSave.push(
            queryRunner.manager.create(Installment, {
              order: savedOrder,
              amount: monthlyAmount,
              storePrincipalAmount: instStoreAmount,
              platformCommissionPortion: instCommission,
              dueDate: null,
              status: InstallmentStatus.PENDING,
            }),
          );
        }

        await queryRunner.manager.save(installmentsToSave);
      }

      incomingAmount = parseFloat(paymentDto.amount.toString());
      if (incomingAmount > finalAmount + 0.01) {
        throw new BadRequestException(
          `El monto del pago excede el balance de la orden ($${finalAmount})`,
        );
      }

      if (paymentDto.reference) {
        const existingPayment = await queryRunner.manager.findOne(Payment, {
          where: {
            reference: paymentDto.reference,
            store: { id: orderDto.storeId },
          },
        });
        if (existingPayment) {
          throw new BadRequestException(
            `La referencia bancaria "${paymentDto.reference}" ya ha sido utilizada en esta tienda.`,
          );
        }
      }

      const payment = queryRunner.manager.create(Payment, {
        ...paymentDto,
        order: savedOrder,
        user,
        store,
        status: PaymentStatus.WAITING_VERIFICATION,
        installmentIndex: isPartialPayment ? 1 : null,
      });

      savedPayment = await queryRunner.manager.save(payment);
      savedOrderId = savedOrder.id;
      firstItemTitle = orderItemsToSave[0]?.title || 'un producto';
      additionalItemsCount = orderItemsToSave.length - 1;

      // Confirmar transacción
      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }

    // Side effects outside database transaction
    if (savedOrderId) {
      try {
        const fullOrder = await this.orderRepository.findOne({
          where: { id: savedOrderId },
          relations: ['user', 'store', 'orderItems'],
        });
        if (fullOrder) {
          this.mailService
            .sendSinglePaymentUnderReview(fullOrder, incomingAmount)
            .catch((err: unknown) => {
              const msg = err instanceof Error ? err.message : String(err);
              this.logger.error(
                `Error sending payment under review email: ${msg}`,
              );
            });
        }
      } catch (mailErr: unknown) {
        const msg =
          mailErr instanceof Error ? mailErr.message : String(mailErr);
        this.logger.error(`Error querying order for email: ${msg}`);
      }

      // Notificar al dueño del comercio que hay un reporte
      try {
        if (storeOwnerId) {
          const itemSuffix =
            additionalItemsCount > 0
              ? ` y ${additionalItemsCount} artículo${additionalItemsCount > 1 ? 's' : ''} más`
              : '';

          await this.notificationService.create({
            userId: storeOwnerId,
            storeId: orderDto.storeId,
            title: `¡Nueva Orden: ${firstItemTitle}${itemSuffix}!`,
            body: `Se ha reportado un pago por '${firstItemTitle}${itemSuffix}' en '${storeName}' por $${paymentDto.amount}.`,
            type: NotificationType.PAYMENT_REPORTED,
            orderId: savedOrderId,
          });
          this.notificationService.notifyStoreInstallmentsUpdated(
            orderDto.storeId,
            {
              orderId: savedOrderId,
            },
          );
        }
      } catch (notifyErr: unknown) {
        const msg =
          notifyErr instanceof Error ? notifyErr.message : String(notifyErr);
        this.logger.error(`Error sending notification to store owner: ${msg}`);
      }
    }

    return savedPayment;
  }

  async confirmRefund(paymentId: string, user: User) {
    const payment = await this.paymentRepository.findOne({
      where: { id: paymentId },
      relations: ['order', 'order.payments', 'store', 'store.owner', 'user'],
    });

    if (!payment) {
      throw new NotFoundException(`Pago #${paymentId} no encontrado`);
    }

    if (payment.user?.id !== user.id && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException(
        'Solo el comprador puede confirmar la recepción del reembolso',
      );
    }

    if (payment.status === PaymentStatus.REFUNDED) {
      return payment;
    }

    if (payment.status !== PaymentStatus.REFUND_PENDING) {
      throw new BadRequestException(
        'Este pago no tiene un reembolso pendiente de confirmación',
      );
    }

    payment.status = PaymentStatus.REFUNDED;
    const saved = await this.paymentRepository.save(payment);

    // Notificar al comercio
    if (payment.store?.owner) {
      try {
        await this.notificationService.create({
          userId: payment.store.owner.id,
          storeId: payment.store.id,
          title: 'Reembolso confirmado',
          body: `El cliente confirmó la recepción del reembolso por $${payment.amount} para la orden #${payment.order.id.split('-')[0].toUpperCase()}.`,
          type: NotificationType.REFUND_CONFIRMED,
          targetId: payment.order.id,
          orderId: payment.order.id,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error(
          `Error notifying store of refund confirmation: ${msg}`,
        );
      }
    }

    // Si ya no quedan pagos pendientes de reembolso ni disputas, cerrar chat
    const remainingPending = payment.order.payments?.filter(
      (p) =>
        p.id !== payment.id &&
        (p.status === PaymentStatus.WAITING_VERIFICATION ||
          p.status === PaymentStatus.REFUND_PENDING),
    );
    if (!remainingPending || remainingPending.length === 0) {
      this.notificationService.closeChatRoom(payment.order.id, 'resolved');
    }

    return saved;
  }
}
