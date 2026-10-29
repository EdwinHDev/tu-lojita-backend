import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, In, Not, MoreThan } from 'typeorm';
import { CreateOrderDto } from './dto/create-order.dto';
import { ValidateCartDto } from './dto/validate-cart.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { ManualPaymentDto } from './dto/manual-payment.dto';
import { CancelOrderDto } from './dto/cancel-order.dto';
import { Order, CancellationResolutionStatus } from './entities/order.entity';
import { Store } from 'src/store/entities/store.entity';
import { StoreStatus } from 'src/store/types/status.enum';
import { StoreCustomerBlock } from 'src/store/entities/store-customer-block.entity';
import { Item } from 'src/item/entities/item.entity';
import { ItemVariant } from 'src/item/entities/item-variant.entity';
import { OrderItem } from 'src/order-item/entities/order-item.entity';
import { User } from 'src/user/entities/user.entity';
import { UserRole } from 'src/user/types/user-role.enum';
import { OrderStatus, InstallmentStatus, ExtensionStatus } from './types';
import { Installment } from './entities/installment.entity';
import { OrderPaginationDto } from './dto/order-pagination.dto';
import { NotificationService } from 'src/notification/notification.service';
import { NotificationType } from 'src/notification/entities/notification.entity';
import { MailService } from 'src/common/mail/mail.service';
import { CompanyActivityLogService } from 'src/company/services/company-activity-log.service';
import { ActivityLogModule } from 'src/company/entities/company-activity-log.entity';
import { InstallmentPeriod } from 'src/store/types/installment-period.enum';
import { Payment } from 'src/payment/entities/payment.entity';
import { PaymentStatus } from 'src/payment/types/payment-status.enum';
import { CommissionService } from 'src/commission/commission.service';
import { OrderReview } from 'src/review/entities/order-review.entity';
import { BuyerReview } from 'src/review/entities/buyer-review.entity';
import { RankingService } from 'src/ranking/services/ranking.service';
import { RankingEventType } from 'src/ranking/types';
import { OrderDispute } from 'src/order-dispute/entities/order-dispute.entity';
import { DisputeStatus } from 'src/order-dispute/types/dispute.enum';
import { BookingType } from 'src/item/types/booking-type.enum';
import { ItemType } from 'src/item/types/item-type.enum';
import { ItemPreorderConfig } from 'src/item/entities/item-preorder-config.entity';
import { PreOrderStatus } from './types/preorder-status.enum';
import { OrderSlotBooking } from './entities/order-slot-booking.entity';
import { SlotBookingStatus } from './types/slot-booking-status.enum';
import { ItemTimeSlot } from 'src/item/entities/item-time-slot.entity';

@Injectable()
export class OrderService {
  constructor(
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,

    @InjectRepository(Store)
    private readonly storeRepository: Repository<Store>,

    @InjectRepository(Item)
    private readonly itemRepository: Repository<Item>,

    @InjectRepository(ItemVariant)
    private readonly itemVariantRepository: Repository<ItemVariant>,

    @InjectRepository(User)
    private readonly userRepository: Repository<User>,

    @InjectRepository(OrderReview)
    private readonly orderReviewRepository: Repository<OrderReview>,

    @InjectRepository(BuyerReview)
    private readonly buyerReviewRepository: Repository<BuyerReview>,

    @InjectRepository(OrderDispute)
    private readonly orderDisputeRepository: Repository<OrderDispute>,

    private readonly dataSource: DataSource,
    private readonly notificationService: NotificationService,
    private readonly mailService: MailService,
    private readonly commissionService: CommissionService,
    private readonly rankingService: RankingService,
    private readonly activityLogService: CompanyActivityLogService,
  ) {}

  private readonly logger = new Logger(OrderService.name);

  /**
   * @deprecated Use PaymentService.createWithOrder() for atomic order creation and payment receipt submission.
   */
  async create(createOrderDto: CreateOrderDto, userId: string) {
    const {
      storeId,
      items: itemsDto,
      isPartialPayment = false,
    } = createOrderDto;

    // 1. Validar Tienda
    const store = await this.storeRepository.findOneBy({ id: storeId });
    if (!store)
      throw new NotFoundException(`Tienda con ID ${storeId} no encontrada`);
    if (store.status !== StoreStatus.ACTIVE) {
      throw new BadRequestException(
        `La tienda no está activa para recibir órdenes`,
      );
    }

    // 2. Validar Usuario (Cliente)
    const user = await this.userRepository.findOneBy({ id: userId });
    if (!user)
      throw new NotFoundException(`Usuario con ID ${userId} no encontrado`);

    if (
      user.accountSuspendedUntil &&
      new Date(user.accountSuspendedUntil) > new Date()
    ) {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'ACCOUNT_SUSPENDED',
        message:
          'No puedes crear pedidos porque tu cuenta está suspendida temporalmente.',
        suspendedUntil: user.accountSuspendedUntil,
        reason:
          user.accountSuspensionReason ||
          'Infracción reiterada de normas de pago.',
      });
    }

    // Iniciar Transacción Atómica
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Validar si el cliente está bloqueado por la tienda
      const isBlocked = await queryRunner.manager.findOne(StoreCustomerBlock, {
        where: { storeId, customerId: userId },
      });
      if (isBlocked) {
        throw new ForbiddenException(
          'La tienda ha restringido las compras para tu cuenta. Puedes enviar una solicitud de mediación desde el perfil de la tienda.',
        );
      }

      // Bloqueo por morosidad (Delinquent Lockout) inter-tienda
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
      }

      // 3. Validar items duplicados en la petición (Seguridad de Datos: unicidad compuesta itemId:variantId)
      const compositeKeys = itemsDto.map(
        (i) => `${i.itemId}:${i.variantId || 'base'}`,
      );
      const uniqueCompositeKeys = new Set(compositeKeys);
      if (uniqueCompositeKeys.size !== itemsDto.length) {
        throw new BadRequestException(
          'La orden contiene items o variantes duplicadas. Por favor, agrupa las cantidades.',
        );
      }

      let subtotal = 0;
      let hasPreOrderItem = false;
      let hasProductItem = false;
      let hasServiceItem = false;
      let bookedServicesCount = 0;
      const orderItemsToSave: OrderItem[] = [];

      // 4. Procesar items y validar stock
      for (const itemDto of itemsDto) {
        const item = await queryRunner.manager.findOne(Item, {
          where: { id: itemDto.itemId },
          relations: [
            'store',
            'customizationGroupsRel',
            'customizationGroupsRel.options',
            'preorderConfig',
          ],
        });
        if (!item)
          throw new NotFoundException(
            `Item con ID ${itemDto.itemId} no encontrado`,
          );

        // Validar que el item pertenece a la tienda especificada
        if (item.store.id !== storeId) {
          throw new BadRequestException(
            `El item "${item.title}" no pertenece a la tienda seleccionada. Solo puedes ordenar items de una misma tienda.`,
          );
        }

        if (item.itemType === ItemType.PRODUCT) {
          hasProductItem = true;
        } else if (item.itemType === ItemType.SERVICE) {
          hasServiceItem = true;
        }

        const isServiceWithSlots =
          item.itemType === ItemType.SERVICE &&
          (item.bookingType === BookingType.TIME_SLOT || item.requiresBooking);
        if (isServiceWithSlots) {
          bookedServicesCount++;
        }

        // Manejo y validación de Variante (Task 3.3)
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

        // Comprobar inventario y deducción atómica (Tasks 3.1 & 3.2 y Pre-orders)
        if (item.bookingType === BookingType.PRE_ORDER) {
          hasPreOrderItem = true;
          const preorderConfig = await queryRunner.manager.findOne(
            ItemPreorderConfig,
            {
              where: { itemId: item.id },
              lock: { mode: 'pessimistic_write' },
            },
          );
          if (preorderConfig) {
            if (
              preorderConfig.reservedPreOrderUnits + itemDto.quantity >
              preorderConfig.maxPreOrderUnits
            ) {
              throw new BadRequestException(
                `Cupo máximo de preventa alcanzado para "${item.title}". Disponibles: ${Math.max(0, preorderConfig.maxPreOrderUnits - preorderConfig.reservedPreOrderUnits)}`,
              );
            }
            preorderConfig.reservedPreOrderUnits += itemDto.quantity;
            await queryRunner.manager.save(preorderConfig);
          }
        } else if (item.trackInventory) {
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

        // Validar opciones (minSelect y maxSelect) e individuales (minQuantity y maxQuantity)
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

            // Validar límites individuales de cada opción (minQuantity y maxQuantity)
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

        // Determinar precio base (prioridad a variant si tiene variantes, sustitutivo NO aditivo - Task 3.8)
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

        // Usar redondeo a 2 decimales para evitar errores de coma flotante en el subtotal
        subtotal = Math.round((subtotal + totalLinePrice) * 100) / 100;

        // Preparar OrderItem (Snapshot con variantId y variantLabel - Task 3.5)
        const orderItem = queryRunner.manager.create(OrderItem, {
          item,
          title: item.title, // Snapshot del nombre
          quantity: itemDto.quantity,
          price: priceAtOrder,
          selectedOptions: itemDto.selectedOptions,
          variantId: item.hasVariants ? variant?.id : undefined,
          variantLabel: item.hasVariants ? variantLabel : undefined,
          variant: item.hasVariants ? variant : undefined,
        });
        orderItemsToSave.push(orderItem);
      }

      if (hasProductItem && hasServiceItem) {
        throw new BadRequestException(
          'No es posible combinar artículos físicos con servicios en la misma orden por razones de logística y despacho.',
        );
      }

      if (bookedServicesCount > 1) {
        throw new BadRequestException(
          'Cada servicio con reserva de turno debe tramitarse en un pedido individual.',
        );
      }

      // 5. Lógica de recargos por pago parcial (Fase 4 extendida)
      let feeAmount = 0;
      if (isPartialPayment) {
        if (!store.allowPartialPayments) {
          throw new BadRequestException(
            'Esta tienda no admite pagos parciales',
          );
        }

        // Validar Frecuencia de Pago
        const requestedValue = createOrderDto.installmentIntervalValue;
        const requestedUnit = createOrderDto.installmentIntervalUnit;

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
          // Fallback para tiendas antiguas con una sola frecuencia
          if (
            requestedValue !== undefined &&
            requestedValue !== store.installmentIntervalValue
          ) {
            throw new BadRequestException(
              'La frecuencia de pago seleccionada no coincide con la configuración de la tienda',
            );
          }
          if (
            requestedUnit !== undefined &&
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

      // Validar Límite de Crédito si el comercio lo tiene configurado
      if (
        isPartialPayment &&
        store.maxCreditLimit !== null &&
        store.maxCreditLimit !== undefined
      ) {
        const maxLimit = parseFloat(store.maxCreditLimit.toString());
        if (maxLimit > 0) {
          const activeOrders = await queryRunner.manager.find(Order, {
            where: {
              user: { id: userId },
              store: { id: storeId },
              isFullyPaid: false,
            },
          });
          const activeDebt = activeOrders.reduce(
            (sum, o) => sum + parseFloat((o.remainingBalance || 0).toString()),
            0,
          );

          if (activeDebt + finalAmount > maxLimit) {
            throw new BadRequestException(
              `El monto de compra excede el límite de crédito disponible en esta tienda. Límite: $${maxLimit.toFixed(2)}, Deuda activa: $${activeDebt.toFixed(2)}, Compra: $${finalAmount.toFixed(2)}`,
            );
          }
        }
      }

      // 6. Crear y guardar la Orden
      const order = queryRunner.manager.create(Order, {
        store,
        user,
        totalAmount: subtotal,
        feeAmount,
        platformCommissionRate: commRate,
        platformCommissionAmount: commAmount,
        finalAmount,
        balance: finalAmount, // Deuda inicial
        isPartialPayment,
        preOrderStatus: hasPreOrderItem
          ? PreOrderStatus.AWAITING_STOCK
          : PreOrderStatus.NONE,
        status: OrderStatus.PENDING,
      });

      if (isPartialPayment) {
        const intervalValue =
          createOrderDto.installmentIntervalValue ||
          store.installmentIntervalValue ||
          7;
        const intervalUnit =
          createOrderDto.installmentIntervalUnit ||
          store.installmentIntervalUnit ||
          InstallmentPeriod.DAYS;

        order.installmentIntervalValue = intervalValue;
        order.installmentIntervalUnit = intervalUnit;

        const nextDate = new Date();
        if (intervalUnit === InstallmentPeriod.DAYS) {
          nextDate.setDate(nextDate.getDate() + intervalValue);
        } else if (intervalUnit === InstallmentPeriod.WEEKS) {
          nextDate.setDate(nextDate.getDate() + intervalValue * 7);
        } else if (intervalUnit === InstallmentPeriod.MONTHS) {
          nextDate.setMonth(nextDate.getMonth() + intervalValue);
        }
        order.nextDueDate = nextDate;
        order.remainingBalance = finalAmount;
        order.totalPaidAmount = 0;
        order.isFullyPaid = false;
      }

      const savedOrder = await queryRunner.manager.save(order);

      // 7. Relacionar y guardar los items de la orden
      for (const oi of orderItemsToSave) {
        oi.order = savedOrder;
        await queryRunner.manager.save(oi);
      }

      // 7.1 Confirmar y asociar el turno agendado (por hold previo o por creación directa al ordenar)
      let resolvedSlotId = createOrderDto.timeSlotId;
      let resolvedBookingDate = createOrderDto.bookingDate;

      if (!resolvedSlotId || !resolvedBookingDate) {
        for (const itemDto of createOrderDto.items) {
          if (itemDto.timeSlotId && itemDto.bookingDate) {
            resolvedSlotId = itemDto.timeSlotId;
            resolvedBookingDate = itemDto.bookingDate;
            break;
          }
        }
      }

      if (createOrderDto.bookingSlotHoldId) {
        const slotBooking = await queryRunner.manager.findOne(
          OrderSlotBooking,
          {
            where: { id: createOrderDto.bookingSlotHoldId },
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

      // 8. Generar Cronograma de Cuotas si es pago parcial
      if (isPartialPayment) {
        const maxInstallments = parseInt(
          store.maxInstallments?.toString() || '1',
        );
        const minInitialPercent = parseFloat(
          store.minInitialPaymentPercentage?.toString() || '0',
        );

        // La primera cuota es el pago inicial mínimo
        const initialAmount =
          Math.round(((finalAmount * minInitialPercent) / 100) * 100) / 100;
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

        // Cuota 1: Inicial (Vence hoy)
        const initialStoreAmount =
          Math.round((initialAmount - perInstallmentCommission) * 100) / 100;

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

        // Cuotas restantes basadas en la frecuencia elegida
        for (let i = 1; i < maxInstallments; i++) {
          const dueDate = new Date();
          const offset = i * (order.installmentIntervalValue || 1);

          if (order.installmentIntervalUnit === InstallmentPeriod.DAYS) {
            dueDate.setDate(now.getDate() + offset);
          } else if (
            order.installmentIntervalUnit === InstallmentPeriod.WEEKS
          ) {
            dueDate.setDate(now.getDate() + offset * 7);
          } else if (
            order.installmentIntervalUnit === InstallmentPeriod.MONTHS
          ) {
            dueDate.setMonth(now.getMonth() + offset);
          }

          // Ajuste de centavos residuales en la última cuota
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
              dueDate: dueDate,
              status: InstallmentStatus.PENDING,
            }),
          );
        }

        await queryRunner.manager.save(installmentsToSave);
      }

      await queryRunner.commitTransaction();

      // Retornar la orden con sus items cargados
      const finalOrder = await this.findOne(savedOrder.id);

      // Enviar confirmación por email de forma asíncrona (sin bloquear la respuesta)
      // Únicamente se envía de forma inmediata para planes de pagos parciales.
      if (finalOrder.isPartialPayment) {
        this.mailService
          .sendOrderConfirmation(finalOrder)
          .catch((err: unknown) => {
            const msg = err instanceof Error ? err.message : String(err);
            this.logger.error(`Error sending confirmation email: ${msg}`);
          });
      }

      // Notificar al dueño del comercio sobre la nueva orden y actualizar tiempo real
      try {
        const storeOwnerId =
          finalOrder.store?.owner?.id || finalOrder.store?.company?.owner?.id;
        if (storeOwnerId) {
          const installmentSuffix = finalOrder.isPartialPayment
            ? ` (en ${finalOrder.installments?.length || 0} cuotas)`
            : '';
          await this.notificationService.create({
            userId: storeOwnerId,
            storeId: finalOrder.store.id,
            title: `¡Nueva compra${installmentSuffix}!`,
            body: `El cliente ${finalOrder.user?.firstName || 'Usuario'} realizó un pedido #${finalOrder.id.slice(0, 8)} por $${finalOrder.totalAmount}`,
            type: NotificationType.ORDER_CREATED,
            orderId: finalOrder.id,
          });
        }
        this.notificationService.notifyStoreInstallmentsUpdated(
          finalOrder.store.id,
          {
            orderId: finalOrder.id,
          },
        );
      } catch (notifyErr) {
        this.logger.error(
          `Error notifying store owner on order create: ${notifyErr}`,
        );
      }

      return finalOrder;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async findOne(id: string) {
    const order = await this.orderRepository.findOne({
      where: { id },
      relations: [
        'store',
        'store.owner',
        'store.company',
        'store.company.owner',
        'store.subcategory',
        'payments',
        'user',
        'user.addresses',
        'orderItems',
        'orderItems.item',
        'orderItems.variant',
        'orderItems.item.store',
        'orderItems.item.store.subcategory',
        'orderItems.item.customizationGroupsRel',
        'orderItems.item.customizationGroupsRel.options',
        'installments',
        'disputes',
        'disputes.requestedBy',
        'slotBookings',
        'slotBookings.timeSlot',
      ],
      order: {
        installments: {
          dueDate: 'ASC',
        },
      },
    });

    if (!order) {
      // Fallback retrocompatible: si id corresponde a una reseña, devolver la orden asociada
      const orderReview = await this.orderReviewRepository.findOne({
        where: { id },
      });
      if (orderReview) {
        return this.findOne(orderReview.orderId);
      }
      const buyerReview = await this.buyerReviewRepository.findOne({
        where: { id },
      });
      if (buyerReview) {
        return this.findOne(buyerReview.orderId);
      }

      throw new NotFoundException(`Orden #${id} no encontrada`);
    }

    return order;
  }

  async findAll(paginationDto: OrderPaginationDto, requestingUser?: User) {
    const {
      status,
      userId,
      storeId,
      isPartialPayment,
      hasBalance,
      startDate,
      endDate,
      search,
      limit,
      offset,
      sort,
      order,
      hasDispute,
    } = paginationDto;

    const queryBuilder = this.orderRepository
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.store', 'store')
      .leftJoinAndSelect('store.subcategory', 'subcategory')
      .leftJoinAndSelect('order.user', 'user')
      .leftJoinAndSelect('user.addresses', 'addresses')
      .leftJoinAndSelect('order.orderItems', 'orderItems')
      .leftJoinAndSelect('orderItems.item', 'item')
      .leftJoinAndSelect('orderItems.variant', 'variant')
      .leftJoinAndSelect(
        'item.customizationGroupsRel',
        'customizationGroupsRel',
      )
      .leftJoinAndSelect('customizationGroupsRel.options', 'options')
      .leftJoinAndSelect('order.payments', 'payments')
      .leftJoinAndSelect('order.installments', 'installments')
      .leftJoinAndSelect('order.disputes', 'disputes')
      .leftJoinAndSelect('order.slotBookings', 'slotBookings')
      .leftJoinAndSelect('slotBookings.timeSlot', 'timeSlot');

    if (status) {
      queryBuilder.andWhere('order.status = :status', { status });
    }

    if (userId) {
      queryBuilder.andWhere('user.id = :userId', { userId });
    }

    if (storeId) {
      queryBuilder.andWhere('store.id = :storeId', { storeId });
    }

    if (isPartialPayment !== undefined) {
      queryBuilder.andWhere('order.isPartialPayment = :isPartialPayment', {
        isPartialPayment,
      });
    }

    if (hasBalance !== undefined) {
      if (hasBalance) {
        queryBuilder.andWhere('order.balance > 0');
      } else {
        queryBuilder.andWhere('order.balance <= 0');
      }
    }

    if (startDate) {
      queryBuilder.andWhere('order.createdAt >= :startDate', { startDate });
    }

    if (endDate) {
      queryBuilder.andWhere('order.createdAt <= :endDate', { endDate });
    }

    if (search && search.trim().length > 0) {
      queryBuilder.andWhere(
        '(CAST(order.id AS TEXT) ILIKE :search OR store.name ILIKE :search OR CAST(order.createdAt AS TEXT) ILIKE :search)',
        { search: `%${search.trim()}%` },
      );
    }

    if (hasDispute !== undefined) {
      if (hasDispute) {
        queryBuilder.andWhere('disputes.id IS NOT NULL');
      } else {
        queryBuilder.andWhere('disputes.id IS NULL');
      }
    }

    // Ordenamiento Dinámico
    const validSortFields = [
      'createdAt',
      'totalAmount',
      'balance',
      'finalAmount',
    ];
    const sortField = validSortFields.includes(sort as string)
      ? `order.${sort}`
      : 'order.createdAt';
    queryBuilder.orderBy(sortField, order || 'DESC');
    queryBuilder.addOrderBy('installments.dueDate', 'ASC');

    // Authorization checks
    if (requestingUser) {
      if (requestingUser.role === UserRole.USER) {
        // Users can only see their own orders
        queryBuilder.andWhere('user.id = :authUserId', {
          authUserId: requestingUser.id,
        });
      } else if (requestingUser.role === UserRole.VENDOR) {
        // Vendors can only see orders from their own store
        if (!requestingUser.store) {
          throw new ForbiddenException('No tienes una tienda asignada');
        }
        queryBuilder.andWhere('store.id = :authStoreId', {
          authStoreId: requestingUser.store.id,
        });
      } else if (requestingUser.role === UserRole.COMPANY) {
        // Company can only see orders from stores that belong to their company
        if (!requestingUser.company) {
          throw new ForbiddenException('No tienes una empresa asignada');
        }

        // Si el actor es un colaborador, restringir estrictamente a sus sucursales autorizadas
        if ((requestingUser as any).isCollaborator) {
          const collab = requestingUser as any;
          if (!collab.hasFullBranchAccess) {
            const allowed: string[] = collab.allowedBranchIds || [];
            if (storeId && !allowed.includes(storeId)) {
              throw new ForbiddenException(
                'No tienes autorización para ver pedidos de esta sucursal',
              );
            }
            if (allowed.length === 0) {
              queryBuilder.andWhere('1 = 0');
            } else {
              queryBuilder.andWhere('store.id IN (:...collabAllowedBranchIds)', {
                collabAllowedBranchIds: allowed,
              });
            }
          } else {
            queryBuilder.andWhere('store.companyId = :authCompanyId', {
              authCompanyId: requestingUser.company.id,
            });
          }
        } else {
          queryBuilder.andWhere('store.companyId = :authCompanyId', {
            authCompanyId: requestingUser.company.id,
          });
        }
      }
    }

    // Paginación
    queryBuilder.skip(offset).take(limit);

    const [items, total] = await queryBuilder.getManyAndCount();

    const itemIds: string[] = [];
    for (const order of items) {
      if (order.orderItems) {
        for (const oi of order.orderItems) {
          if (oi.item && oi.item.id) {
            itemIds.push(oi.item.id);
          }
        }
      }
    }

    if (itemIds.length > 0) {
      const fullItems = await this.itemRepository.find({
        where: { id: In(itemIds) },
        relations: ['customizationGroupsRel', 'customizationGroupsRel.options'],
      });

      const itemMap = new Map<string, Item>();
      for (const item of fullItems) {
        itemMap.set(item.id, item);
      }

      for (const order of items) {
        if (order.orderItems) {
          for (const oi of order.orderItems) {
            if (oi.item && oi.item.id) {
              const fullItem = itemMap.get(oi.item.id);
              if (fullItem) {
                oi.item.customizationGroupsRel =
                  fullItem.customizationGroupsRel;
              }
            }
          }
        }
      }
    }

    return {
      items,
      total,
      limit,
      offset,
    };
  }

  async cancelOrder(
    id: string,
    userId: string,
    cancelOrderDto?: CancelOrderDto,
    requestingUser?: User,
  ) {
    const order = await this.findOne(id);

    // Validar Seguridad: Solo el dueño de la orden o un Administrador puede cancelarla
    const isAdmin = requestingUser?.role === UserRole.ADMIN;
    if (order.user.id !== userId && !isAdmin) {
      throw new BadRequestException(
        'No tienes permiso para cancelar esta orden',
      );
    }

    if (order.status === OrderStatus.CANCELLED) {
      throw new BadRequestException('Esta orden ya está cancelada');
    }

    if (order.status === OrderStatus.FULLY_PAID && !isAdmin) {
      throw new BadRequestException(
        'No se puede cancelar una orden que ya ha sido pagada en su totalidad',
      );
    }

    // Validar que ningún pago haya sido ya verificado/aprobado por el comercio (a menos que sea el Admin)
    const hasApprovedPayment = order.payments?.some(
      (p) => p.status === PaymentStatus.APPROVED,
    );
    if (!isAdmin && hasApprovedPayment) {
      throw new BadRequestException(
        'No puedes cancelar una orden cuyo pago ya ha sido verificado y aprobado por la tienda.',
      );
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 1. Devolver Stock
      for (const orderItem of order.orderItems) {
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

      // 1b. Si el cliente declaró no requerir reembolso, rechazar pagos reportados directamente sin sumar fraude
      if (cancelOrderDto?.cancellationAction === 'NO_REFUND') {
        const orderPayments = await queryRunner.manager.find(Payment, {
          where: { order: { id: order.id } },
        });
        for (const p of orderPayments) {
          if (
            p.status === PaymentStatus.WAITING_VERIFICATION ||
            p.status === PaymentStatus.PENDING
          ) {
            p.status = PaymentStatus.REJECTED;
            p.rejectionReason =
              'Cliente canceló declarando no haber transferido / no requerir reembolso';
            await queryRunner.manager.save(Payment, p);
          }
        }
      }

      // 1c. Si es preventa, liberar cupos reservados
      if (order.preOrderStatus !== PreOrderStatus.NONE) {
        order.preOrderStatus = PreOrderStatus.CANCELLED;
        for (const orderItem of order.orderItems) {
          if (
            orderItem.item &&
            orderItem.item.bookingType === BookingType.PRE_ORDER
          ) {
            const preorderConfig = await queryRunner.manager.findOne(
              ItemPreorderConfig,
              { where: { item: { id: orderItem.item.id } } },
            );
            if (preorderConfig && preorderConfig.reservedPreOrderUnits > 0) {
              preorderConfig.reservedPreOrderUnits = Math.max(
                0,
                preorderConfig.reservedPreOrderUnits - orderItem.quantity,
              );
              await queryRunner.manager.save(preorderConfig);
            }
          }
        }
      }

      // 1d. Si tiene reservas de turnos (slotBookings), marcarlos como cancelados
      if (order.slotBookings && order.slotBookings.length > 0) {
        for (const sb of order.slotBookings) {
          sb.status = SlotBookingStatus.CANCELLED;
          await queryRunner.manager.save(sb);
        }
      }

      // 2. Cambiar estado y registrar motivo
      order.status = OrderStatus.CANCELLED;
      order.cancelledAt = new Date();
      if (cancelOrderDto?.cancellationAction === 'NO_REFUND') {
        order.cancellationResolutionStatus =
          CancellationResolutionStatus.RESOLVED;
      }
      let finalReason = cancelOrderDto?.reason?.trim();
      const cancellationNotes = cancelOrderDto?.cancellationNotes?.trim();
      const refundNotes = cancelOrderDto?.refundNotes?.trim();
      const notes = cancellationNotes || refundNotes;
      if (notes) {
        const label = cancellationNotes ? 'Nota' : 'Reembolso';
        finalReason = finalReason
          ? `${finalReason} | ${label}: ${notes}`
          : `${label}: ${notes}`;
      }
      order.rejectionReason =
        finalReason ||
        (isAdmin
          ? 'Cancelada por el equipo de soporte'
          : 'Cancelada por el cliente');
      await queryRunner.manager.save(order);

      // Anular comisión de la plataforma
      await this.commissionService.voidOrderCommission(
        order,
        queryRunner.manager,
      );

      await queryRunner.commitTransaction();

      const companyId =
        order.store?.company?.id ||
        order.store?.companyId ||
        (requestingUser as any)?.company?.id;
      if (companyId && requestingUser) {
        this.activityLogService.log({
          companyId,
          storeId: order.store?.id,
          user: requestingUser,
          module: ActivityLogModule.ORDERS,
          action: 'ORDER_CANCELLED',
          description: `Canceló la orden #${order.id.split('-')[0].toUpperCase()} (Motivo: ${finalReason || 'Sin motivo'}).`,
          metadata: {
            orderId: order.id,
            reason: finalReason,
            totalAmount: order.totalAmount,
          },
        });
      }

      // Notificar al dueño de la tienda para que esté al tanto
      try {
        if (order.store?.owner?.id) {
          const hasPendingPayments = order.payments?.some(
            (p) =>
              p.status === PaymentStatus.WAITING_VERIFICATION ||
              p.status === PaymentStatus.APPROVED ||
              p.status === PaymentStatus.REFUND_PENDING,
          );
          const bodyMsg = hasPendingPayments
            ? `El cliente ha cancelado la orden #${order.id.split('-')[0].toUpperCase()}. Hay pagos pendientes de verificación/reembolso. Motivo: ${order.rejectionReason}`
            : `El cliente ha cancelado la orden #${order.id.split('-')[0].toUpperCase()}. No requiere reembolso. Motivo: ${order.rejectionReason}`;

          await this.notificationService.create({
            userId: order.store.owner.id,
            storeId: order.store.id,
            title: 'Orden cancelada por el cliente',
            body: bodyMsg,
            type: NotificationType.GENERAL,
            orderId: order.id,
          });
        }
      } catch (notifErr) {
        this.logger.warn(
          `Could not notify store owner of cancellation: ${notifErr}`,
        );
      }

      return this.findOne(id);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async acceptPaymentNotReceived(orderId: string, userId: string) {
    const order = await this.orderRepository.findOne({
      where: { id: orderId },
      relations: [
        'user',
        'store',
        'store.owner',
        'orderItems',
        'orderItems.item',
        'payments',
      ],
    });

    if (!order) {
      throw new NotFoundException(`Orden #${orderId} no encontrada`);
    }

    if (order.user.id !== userId) {
      throw new ForbiddenException(
        'No tienes permiso para realizar esta acción en esta orden',
      );
    }

    const hasApproved = order.payments?.some(
      (p) => p.status === PaymentStatus.APPROVED,
    );
    if (hasApproved) {
      throw new BadRequestException(
        'No se puede aceptar el reporte porque la orden ya tiene pagos aprobados',
      );
    }

    const activeDispute = await this.orderDisputeRepository.findOne({
      where: {
        orderId,
        status: In([
          DisputeStatus.OPEN,
          DisputeStatus.MERCHANT_RESPONDED,
          DisputeStatus.ADMIN_REVIEW,
        ]),
      },
    });
    if (activeDispute) {
      throw new BadRequestException(
        'No se puede cerrar la orden porque tiene una disputa o reclamo activo en proceso de revisión.',
      );
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 1. Si la orden aún tiene inventario tomado (no cancelada previamente), devolverlo
      if (order.status !== OrderStatus.CANCELLED) {
        for (const orderItem of order.orderItems) {
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
      }

      // 2. Marcar pagos pendientes como rechazados
      if (order.payments) {
        for (const payment of order.payments) {
          if (
            payment.status === PaymentStatus.WAITING_VERIFICATION ||
            payment.status === PaymentStatus.PENDING
          ) {
            payment.status = PaymentStatus.REJECTED;
            payment.rejectionReason =
              'Cliente aceptó que el pago no fue recibido por la tienda';
            await queryRunner.manager.save(Payment, payment);
          }
        }
      }

      // 3. Cerrar la orden pacíficamente
      order.status = OrderStatus.CANCELLED;
      order.cancelledAt = new Date();
      order.cancellationResolutionConfirmed = true;
      order.cancellationResolvedAt = new Date();
      order.cancellationResolutionStatus =
        CancellationResolutionStatus.RESOLVED;
      order.rejectionReason =
        'Cliente aceptó que el pago no fue recibido. Orden cerrada de común acuerdo.';
      await queryRunner.manager.save(Order, order);

      // Anular comisión si la hubiere
      await this.commissionService.voidOrderCommission(
        order,
        queryRunner.manager,
      );

      // 4. Si el cliente tenía acumulado rechazo por este reporte de la tienda, restituir / no penalizar
      const customer = await queryRunner.manager.findOne(User, {
        where: { id: userId },
      });
      if (customer && customer.consecutiveRejectedPaymentsCount > 0) {
        customer.consecutiveRejectedPaymentsCount = Math.max(
          0,
          customer.consecutiveRejectedPaymentsCount - 1,
        );
        if (
          customer.consecutiveRejectedPaymentsCount < 3 &&
          customer.accountSuspendedUntil
        ) {
          customer.accountSuspendedUntil = null;
          customer.accountSuspensionReason = null;
        }
        await queryRunner.manager.save(User, customer);
      }

      await queryRunner.commitTransaction();

      const companyId =
        order.store?.company?.id || (order.store as any)?.companyId;
      if (companyId) {
        this.activityLogService.log({
          companyId,
          storeId: order.store?.id,
          user: order.store?.owner || customer,
          module: ActivityLogModule.ORDERS,
          action: 'ORDER_BILATERAL_CLOSED',
          description: `Cerró de común acuerdo la orden #${order.id.split('-')[0].toUpperCase()} (Pago no recibido).`,
          metadata: {
            orderId: order.id,
            totalAmount: order.totalAmount,
          },
        });
      }

      // Notificar a la tienda
      try {
        if (order.store?.owner?.id) {
          await this.notificationService.create({
            userId: order.store.owner.id,
            storeId: order.store.id,
            title: 'Orden cerrada de común acuerdo',
            body: `El cliente ha aceptado que el pago de la orden #${order.id.split('-')[0].toUpperCase()} no llegó. La orden ha sido cerrada sin reclamos.`,
            type: NotificationType.GENERAL,
            orderId: order.id,
          });
        }
      } catch (e) {
        this.logger.warn(
          `Could not notify store owner of accepted non-payment: ${e}`,
        );
      }

      // Sincronizar en tiempo real el nuevo estado resuelto
      try {
        this.notificationService.notifyOrderUpdated(order.id, {
          orderId: order.id,
          storeId: order.store?.id,
          userId: order.user?.id || userId,
          type: 'ORDER_UPDATED',
          cancellationResolutionStatus: order.cancellationResolutionStatus,
          cancellationResolutionConfirmed: true,
        });
      } catch (e) {
        this.logger.warn(
          `Could not broadcast order_updated for order ${order.id}: ${e}`,
        );
      }

      return {
        message:
          'Has aceptado que el pago no fue recibido. La orden se cerró exitosamente.',
        order,
      };
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  async update(
    id: string,
    updateOrderDto: UpdateOrderDto,
    requestingUser?: User,
  ) {
    const order = await this.findOne(id);

    // Verify ownership
    if (requestingUser) {
      if (
        requestingUser.role === UserRole.USER &&
        order.user.id !== requestingUser.id
      ) {
        throw new ForbiddenException(
          'No tienes permiso para actualizar esta orden',
        );
      } else if (requestingUser.role === UserRole.VENDOR) {
        if (
          !requestingUser.store ||
          order.store.id !== requestingUser.store.id
        ) {
          throw new ForbiddenException(
            'No tienes permiso para actualizar órdenes de esta tienda',
          );
        }
      } else if (requestingUser.role === UserRole.COMPANY) {
        if (
          !requestingUser.company ||
          order.store.company?.id !== requestingUser.company.id
        ) {
          throw new ForbiddenException(
            'No tienes permiso para actualizar órdenes de esta empresa',
          );
        }
      }
    }

    const oldStatus = order.status;
    this.orderRepository.merge(order, updateOrderDto);

    // Si la orden pasa a FULLY_PAID, regularizar balances y cuotas
    if (
      updateOrderDto.status === OrderStatus.FULLY_PAID &&
      oldStatus !== OrderStatus.FULLY_PAID
    ) {
      order.balance = 0;
      order.remainingBalance = 0;
      order.totalPaidAmount = parseFloat(
        order.finalAmount?.toString() || order.totalAmount?.toString() || '0',
      );
      order.isFullyPaid = true;
      order.nextDueDate = null;

      if (order.isPartialPayment) {
        const installments = await this.dataSource
          .getRepository(Installment)
          .find({
            where: { order: { id: order.id } },
          });
        for (const inst of installments) {
          inst.status = InstallmentStatus.PAID;
          inst.paidAmount = inst.amount;
          await this.dataSource.getRepository(Installment).save(inst);
        }
      }
    }

    // [Fix 2] Si el comerciante cancela la orden, validar que no haya pagado primera cuota y devolver stock
    if (
      updateOrderDto.status === OrderStatus.CANCELLED &&
      oldStatus !== OrderStatus.CANCELLED
    ) {
      if (
        oldStatus === OrderStatus.PARTIALLY_PAID ||
        oldStatus === OrderStatus.FULLY_PAID
      ) {
        throw new BadRequestException(
          'No se puede cancelar una venta después de haber pagado o aprobado la primera cuota.',
        );
      }

      const cancelQueryRunner = this.dataSource.createQueryRunner();
      await cancelQueryRunner.connect();
      await cancelQueryRunner.startTransaction();
      try {
        // Devolver stock de cada item que lo rastrea
        for (const orderItem of order.orderItems) {
          const item = orderItem.item;
          if (item && item.trackInventory) {
            if (item.hasVariants && orderItem.variantId) {
              const variant = await cancelQueryRunner.manager.findOne(
                ItemVariant,
                {
                  where: { id: orderItem.variantId },
                },
              );
              if (variant) {
                const currentStock = parseFloat(
                  variant.stockQuantity?.toString() || '0',
                );
                variant.stockQuantity = currentStock + orderItem.quantity;
                await cancelQueryRunner.manager.save(variant);
              } else {
                const currentStock = parseFloat(
                  item.stockQuantity?.toString() || '0',
                );
                item.stockQuantity = currentStock + orderItem.quantity;
                await cancelQueryRunner.manager.save(item);
              }
            } else {
              const currentStock = parseFloat(
                item.stockQuantity?.toString() || '0',
              );
              item.stockQuantity = currentStock + orderItem.quantity;
              await cancelQueryRunner.manager.save(item);
            }
          }
        }
        // Guardar la orden con el nuevo estado dentro de la misma transacción
        await cancelQueryRunner.manager.save(order);
        await cancelQueryRunner.commitTransaction();
      } catch (error) {
        await cancelQueryRunner.rollbackTransaction();
        throw error;
      } finally {
        await cancelQueryRunner.release();
      }
    } else {
      await this.orderRepository.save(order);
    }

    const updatedOrder = await this.orderRepository.findOne({
      where: { id: order.id },
    });

    // Trigger Notification to Customer if status changed
    if (updateOrderDto.status && updateOrderDto.status !== oldStatus) {
      let title = '';
      let body = '';
      let type = NotificationType.GENERAL;

      if (updateOrderDto.status === OrderStatus.FULLY_PAID) {
        title = '¡Tu pedido ha sido aprobado!';
        body = `Tu pedido #${order.id.split('-')[0].toUpperCase()} en ${order.store.name} ha sido aprobado y está siendo procesado.`;
        type = NotificationType.ORDER_APPROVED;

        // Auto-approve all waiting verification or pending payments for this order
        await this.dataSource.getRepository(Payment).update(
          {
            order: { id: order.id },
            status: In([
              PaymentStatus.PENDING,
              PaymentStatus.WAITING_VERIFICATION,
            ]),
          },
          { status: PaymentStatus.APPROVED },
        );
      } else if (updateOrderDto.status === OrderStatus.CANCELLED) {
        title = 'Pedido rechazado';
        body = `Tu pedido #${order.id.split('-')[0].toUpperCase()} en ${order.store.name} ha sido rechazado o cancelado.`;
        if (updateOrderDto.rejectionReason) {
          body += ` Motivo: ${updateOrderDto.rejectionReason}`;
        }
        type = NotificationType.ORDER_REJECTED;
      }

      if (title) {
        await this.notificationService.create({
          userId: order.user.id,
          title,
          body,
          type,
          targetId: order.id,
        });
      }

      if (
        updateOrderDto.status === OrderStatus.FULLY_PAID ||
        updateOrderDto.status === OrderStatus.CANCELLED
      ) {
        await this.notificationService.closeChatRoom(
          order.id,
          updateOrderDto.status === OrderStatus.FULLY_PAID
            ? 'approved'
            : 'rejected',
        );

        // Disparar notificaciones de calificación y ranking al completar la orden
        if (updateOrderDto.status === OrderStatus.FULLY_PAID) {
          try {
            if (order.store?.id) {
              await this.rankingService.processEvent(
                order.store.id,
                RankingEventType.ORDER_COMPLETED,
                order.id,
                order.user?.id,
              );
            }
          } catch (rankErr) {
            this.logger.error(
              `Error processing ranking completed order event: ${rankErr.message}`,
            );
          }

          try {
            if (order.user?.id) {
              await this.notificationService.create({
                userId: order.user.id,
                title: '⭐ ¿Cómo estuvo tu compra?',
                body: 'Tu orden ha sido completada. ¡Deja tu calificación!',
                type: NotificationType.ORDER_REVIEW_PROMPT,
                orderId: order.id,
                targetId: order.id,
              });
            }
            if (order.store?.owner?.id) {
              await this.notificationService.create({
                userId: order.store.owner.id,
                storeId: order.store.id,
                title: '👤 Califica a tu comprador',
                body: 'Una orden fue completada. Puedes calificar al cliente.',
                type: NotificationType.BUYER_REVIEW_PROMPT,
                orderId: order.id,
                targetId: order.id,
              });
            }
          } catch (err) {
            this.logger.error(
              `Error sending review prompt notifications: ${err.message}`,
            );
          }
        }

        // Penalización de ranking al cancelar la orden por parte del comercio
        if (updateOrderDto.status === OrderStatus.CANCELLED) {
          try {
            if (order.store?.id) {
              await this.rankingService.processEvent(
                order.store.id,
                RankingEventType.ORDER_CANCELLED_BY_SELLER,
                order.id,
              );
            }
          } catch (rankErr) {
            this.logger.error(
              `Error processing ranking cancellation event: ${rankErr.message}`,
            );
          }
        }
      }
    }

    return updatedOrder;
  }

  async remove(id: string) {
    const order = await this.findOne(id);
    await this.orderRepository.remove(order);
    return { deleted: true };
  }

  async findStoreInstallments(storeId: string) {
    const installments = await this.dataSource.getRepository(Installment).find({
      where: {
        order: {
          store: { id: storeId },
          status: Not(In([OrderStatus.CANCELLED, OrderStatus.REJECTED])),
        },
      },
      relations: [
        'order',
        'order.user',
        'order.payments',
        'order.installments',
        'order.orderItems',
      ],
      order: { dueDate: 'ASC' },
    });

    // Las cuotas sin fecha asignada no deben cobrarse hasta que se revise y apruebe la cuota anterior.
    // Solo se muestran si ya tienen dueDate o si tienen un pago esperando verificación.
    return installments.filter((inst) => {
      if (inst.dueDate !== null && inst.dueDate !== undefined) {
        return true;
      }

      const hasWaitingPayment = (inst.order?.payments || []).some(
        (p) => p.status === PaymentStatus.WAITING_VERIFICATION,
      );

      // Si es la primera cuota y la orden está pendiente o en verificación
      const isFirstInstallment =
        inst.order?.installments &&
        inst.order.installments.length > 0 &&
        inst.order.installments[0].id === inst.id;

      return hasWaitingPayment || isFirstInstallment;
    });
  }

  async requestExtension(
    installmentId: string,
    requestedDays: number,
    reason: string,
    userId: string,
  ) {
    const installmentRepo = this.dataSource.getRepository(Installment);
    const installment = await installmentRepo.findOne({
      where: { id: installmentId },
      relations: ['order', 'order.user', 'order.store', 'order.store.owner'],
    });

    if (!installment) {
      throw new NotFoundException(`Cuota #${installmentId} no encontrada`);
    }

    if (installment.order.user.id !== userId) {
      throw new ForbiddenException(
        'No tienes permiso para solicitar prórrogas en esta orden',
      );
    }

    const store = installment.order.store;
    if (!store.allowInstallmentExtensions) {
      throw new BadRequestException(
        'Esta tienda no permite solicitudes de prórrogas',
      );
    }

    if (requestedDays > store.maxExtensionDays) {
      throw new BadRequestException(
        `No puedes solicitar una prórroga de más de ${store.maxExtensionDays} días`,
      );
    }

    if (installment.status === InstallmentStatus.PAID) {
      throw new BadRequestException('Esta cuota ya está pagada');
    }

    installment.extensionStatus = ExtensionStatus.PENDING;
    installment.extensionRequestedDays = requestedDays;
    installment.extensionReason = reason;

    const saved = await installmentRepo.save(installment);

    // Notificar al dueño de la tienda
    try {
      const ownerId = store.owner?.id;
      if (ownerId) {
        const clientName =
          `${installment.order.user.firstName} ${installment.order.user.lastName}`.trim();
        await this.notificationService.create({
          userId: ownerId,
          storeId: store.id,
          title: 'Solicitud de Prórroga',
          body: `El cliente ${clientName} ha solicitado una prórroga de ${requestedDays} días para una cuota de la orden #${installment.order.id.split('-')[0].toUpperCase()}.`,
          type: NotificationType.GENERAL,
          orderId: installment.order.id,
        });
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.error(`Error sending notification to store owner: ${msg}`);
    }

    return saved;
  }

  async verifyExtension(
    installmentId: string,
    status: 'APPROVED' | 'REJECTED',
    merchantComment: string,
    storeOwnerId: string,
  ) {
    const installmentRepo = this.dataSource.getRepository(Installment);
    const installment = await installmentRepo.findOne({
      where: { id: installmentId },
      relations: ['order', 'order.user', 'order.store', 'order.store.owner'],
    });

    if (!installment) {
      throw new NotFoundException(`Cuota #${installmentId} no encontrada`);
    }

    const store = installment.order.store;
    if (!store.owner || store.owner.id !== storeOwnerId) {
      throw new ForbiddenException(
        'No tienes permiso para resolver prórrogas de esta tienda',
      );
    }

    if (installment.extensionStatus !== ExtensionStatus.PENDING) {
      throw new BadRequestException(
        'Esta prórroga ya ha sido resuelta o no ha sido solicitada',
      );
    }

    if (status === 'APPROVED') {
      installment.extensionStatus = ExtensionStatus.APPROVED;
      installment.extensionMerchantComment = merchantComment;

      const days = installment.extensionRequestedDays || 7;
      const originalDueDate = installment.dueDate
        ? new Date(installment.dueDate)
        : new Date();
      originalDueDate.setDate(originalDueDate.getDate() + days);
      installment.dueDate = originalDueDate;

      // Si estaba vencida, vuelve a estar pendiente porque la nueva fecha está en el futuro
      if (installment.status === InstallmentStatus.OVERDUE) {
        installment.status = InstallmentStatus.PENDING;
      }
    } else {
      installment.extensionStatus = ExtensionStatus.REJECTED;
      installment.extensionMerchantComment = merchantComment;
    }

    const saved = await installmentRepo.save(installment);

    // Notificar al cliente
    try {
      const statusText = status === 'APPROVED' ? 'aprobada' : 'rechazada';
      const bodyText =
        status === 'APPROVED'
          ? `Tu solicitud de prórroga ha sido aprobada. Nueva fecha de vencimiento: ${installment.dueDate ? installment.dueDate.toLocaleDateString('es-VE') : 'Por definir'}.`
          : `Tu solicitud de prórroga ha sido rechazada. Motivo: ${merchantComment || 'No especificado'}.`;

      await this.notificationService.create({
        userId: installment.order.user.id,
        title: `Prórroga ${statusText}`,
        body: bodyText,
        type:
          status === 'APPROVED'
            ? NotificationType.PAYMENT_APPROVED
            : NotificationType.PAYMENT_REJECTED,
        orderId: installment.order.id,
      });

      // Intentar enviar correo
      if (status === 'APPROVED' && installment.dueDate) {
        this.mailService
          .sendPaymentReminder(
            installment.order.user.email,
            installment.order.user.firstName,
            installment.amount,
            installment.dueDate,
            installment.order.id,
          )
          .catch((err: unknown) => {
            const msg = err instanceof Error ? err.message : String(err);
            this.logger.error(`Error sending email: ${msg}`);
          });
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.error(`Error notifying customer: ${msg}`);
    }

    return saved;
  }

  async validateCart(dto: ValidateCartDto) {
    const { storeId, items: itemsDto, isPartialPayment = false } = dto;
    const errors: {
      itemId?: string;
      storeId?: string;
      code: string;
      message: string;
      currentPrice?: number;
    }[] = [];

    // 1. Validar Tienda
    const store = await this.storeRepository.findOneBy({ id: storeId });
    if (!store) {
      errors.push({
        storeId,
        code: 'STORE_NOT_FOUND',
        message: 'La tienda seleccionada no existe.',
      });
      return { isValid: false, errors };
    }

    if (store.status !== StoreStatus.ACTIVE) {
      errors.push({
        storeId,
        code: 'STORE_INACTIVE',
        message: 'La tienda no está activa actualmente.',
      });
    }

    // 2. Validar artículos y stock
    let calculatedSubtotal = 0;
    let hasProductItem = false;
    let hasServiceItem = false;
    let bookedServicesCount = 0;

    for (const itemDto of itemsDto) {
      const item = await this.itemRepository.findOne({
        where: { id: itemDto.itemId },
        relations: [
          'store',
          'customizationGroupsRel',
          'customizationGroupsRel.options',
        ],
      });

      if (!item) {
        errors.push({
          itemId: itemDto.itemId,
          code: 'ITEM_NOT_FOUND',
          message: 'El artículo ya no existe en el catálogo.',
        });
        continue;
      }

      if (item.store.id !== storeId) {
        errors.push({
          itemId: itemDto.itemId,
          code: 'STORE_MISMATCH',
          message: `El artículo "${item.title}" no pertenece a la tienda actual.`,
        });
      }

      if (item.itemType === ItemType.PRODUCT) {
        hasProductItem = true;
      } else if (item.itemType === ItemType.SERVICE) {
        hasServiceItem = true;
      }

      const isServiceWithSlots =
        item.itemType === ItemType.SERVICE &&
        (item.bookingType === BookingType.TIME_SLOT || item.requiresBooking);
      if (isServiceWithSlots) {
        bookedServicesCount++;
      }

      // Validar Variante si aplica
      let variant: ItemVariant | null = null;
      if (item.hasVariants) {
        if (!itemDto.variantId) {
          errors.push({
            itemId: itemDto.itemId,
            code: 'VARIANT_REQUIRED',
            message: `Debes seleccionar una variante para "${item.title}".`,
          });
        } else {
          variant = await this.itemVariantRepository.findOne({
            where: { id: itemDto.variantId, item: { id: item.id } },
          });
          if (!variant || !variant.isActive) {
            errors.push({
              itemId: itemDto.itemId,
              code: 'VARIANT_NOT_AVAILABLE',
              message: `La variante seleccionada para "${item.title}" no está disponible.`,
            });
          }
        }
      }

      // Validar stock
      if (item.trackInventory) {
        if (item.hasVariants && variant) {
          const currentStock = parseFloat(
            variant.stockQuantity?.toString() || '0',
          );
          if (currentStock < itemDto.quantity) {
            errors.push({
              itemId: itemDto.itemId,
              code: 'OUT_OF_STOCK',
              message: `Stock insuficiente para la opción seleccionada de "${item.title}". Disponible: ${currentStock}`,
            });
          }
        } else if (!item.hasVariants) {
          const currentStock = parseFloat(
            item.stockQuantity?.toString() || '0',
          );
          if (currentStock < itemDto.quantity) {
            errors.push({
              itemId: itemDto.itemId,
              code: 'OUT_OF_STOCK',
              message: `Stock insuficiente para "${item.title}". Disponible: ${currentStock}`,
            });
          }
        }
      }

      // Determinar precio efectivo
      let effectivePrice = item.discountPrice
        ? parseFloat(item.discountPrice.toString())
        : parseFloat(item.price.toString());

      if (item.hasVariants && variant) {
        if (
          variant.discountPrice !== null &&
          variant.discountPrice !== undefined
        ) {
          effectivePrice = parseFloat(variant.discountPrice.toString());
        } else if (variant.price !== null && variant.price !== undefined) {
          effectivePrice = parseFloat(variant.price.toString());
        }
      }

      // Validar cambio de precio
      if (itemDto.priceAtCart !== undefined && itemDto.priceAtCart !== null) {
        const cartPrice = parseFloat(itemDto.priceAtCart.toString());
        if (Math.abs(effectivePrice - cartPrice) > 0.001) {
          errors.push({
            itemId: itemDto.itemId,
            code: 'PRICE_CHANGED',
            message: `El precio de "${item.title}" cambió de $${cartPrice.toFixed(2)} a $${effectivePrice.toFixed(2)}.`,
            currentPrice: effectivePrice,
          });
        }
      }

      // Validar opciones personalizadas (minSelect / maxSelect y minQuantity / maxQuantity)
      let customizationExtra = 0;
      if (item.customizationGroupsRel) {
        for (const group of item.customizationGroupsRel) {
          const selectedOptIds = itemDto.selectedOptions?.[group.id] || [];
          const requiredMin = group.minSelect * itemDto.quantity;
          const requiredMax = group.maxSelect * itemDto.quantity;

          if (group.minSelect > 0 && selectedOptIds.length < requiredMin) {
            errors.push({
              itemId: itemDto.itemId,
              code: 'MIN_SELECT_VIOLATION',
              message: `Debes seleccionar al menos ${group.minSelect} opción(es) de "${group.name}".`,
            });
          }
          if (group.maxSelect > 0 && selectedOptIds.length > requiredMax) {
            errors.push({
              itemId: itemDto.itemId,
              code: 'MAX_SELECT_VIOLATION',
              message: `Puedes seleccionar como máximo ${group.maxSelect} opción(es) de "${group.name}".`,
            });
          }

          // Validar opciones individuales
          if (group.options) {
            for (const opt of group.options) {
              const optCount = selectedOptIds.filter(
                (id) => id === opt.id,
              ).length;
              if (optCount > 0) {
                if (opt.minQuantity > 0 && optCount < opt.minQuantity) {
                  errors.push({
                    itemId: itemDto.itemId,
                    code: 'MIN_QTY_VIOLATION',
                    message: `Debes seleccionar al menos ${opt.minQuantity} de "${opt.name}".`,
                  });
                }
                if (opt.maxQuantity > 0 && optCount > opt.maxQuantity) {
                  errors.push({
                    itemId: itemDto.itemId,
                    code: 'MAX_QTY_VIOLATION',
                    message: `Puedes seleccionar como máximo ${opt.maxQuantity} de "${opt.name}".`,
                  });
                }
                const defaultQty = opt.defaultQuantity || 0;
                const chargeableQty = optCount - defaultQty * itemDto.quantity;
                if (chargeableQty > 0) {
                  customizationExtra +=
                    chargeableQty * parseFloat(opt.price?.toString() || '0');
                }
              }
            }
          }
        }
      }

      const basePrice = effectivePrice;
      const totalLinePrice = basePrice * itemDto.quantity + customizationExtra;
      calculatedSubtotal =
        Math.round((calculatedSubtotal + totalLinePrice) * 100) / 100;
    }

    if (hasProductItem && hasServiceItem) {
      errors.push({
        code: 'INCOMPATIBLE_ITEM_TYPES',
        message:
          'No es posible combinar artículos físicos con servicios en la misma orden por razones de logística y despacho.',
      });
    }

    if (bookedServicesCount > 1) {
      errors.push({
        code: 'MULTIPLE_BOOKINGS_NOT_ALLOWED',
        message:
          'Cada servicio con reserva de turno debe tramitarse en un pedido individual.',
      });
    }

    // 3. Validar políticas de pagos parciales (si aplica)
    if (isPartialPayment) {
      if (!store.allowPartialPayments) {
        errors.push({
          storeId,
          code: 'PARTIAL_PAYMENTS_DISABLED',
          message: 'La tienda ya no admite pagos en cuotas.',
        });
      } else {
        const requestedValue = dto.installmentIntervalValue;
        const requestedUnit = dto.installmentIntervalUnit;

        if (
          store.installmentFrequencyOptions &&
          store.installmentFrequencyOptions.length > 0
        ) {
          if (!requestedValue || !requestedUnit) {
            errors.push({
              storeId,
              code: 'FREQUENCY_REQUIRED',
              message:
                'Debes seleccionar una frecuencia de pago para el pago parcial.',
            });
          } else {
            const isValidFrequency = store.installmentFrequencyOptions.some(
              (freq) =>
                freq.value === requestedValue && freq.unit === requestedUnit,
            );
            if (!isValidFrequency) {
              errors.push({
                storeId,
                code: 'INVALID_FREQUENCY',
                message:
                  'La frecuencia de pago seleccionada ya no es admitida por la tienda.',
              });
            }
          }
        }
      }
    }

    // 4. Calcular desglose financiero de cotización (pricingSummary)
    let feeAmount = 0;
    if (isPartialPayment && store.allowPartialPayments) {
      const feePercent = parseFloat(
        (store.partialPaymentsFeePercentage || 0).toString(),
      );
      feeAmount =
        Math.round(((calculatedSubtotal * feePercent) / 100) * 100) / 100;
    }

    const storeTotal = Math.round((calculatedSubtotal + feeAmount) * 100) / 100;

    const { rate: commRate, commissionAmount: commAmount } =
      await this.commissionService.calculateCommission(
        storeTotal,
        isPartialPayment,
        store,
      );

    const finalAmount = Math.round((storeTotal + commAmount) * 100) / 100;

    return {
      isValid: errors.length === 0,
      errors,
      pricingSummary: {
        subtotal: calculatedSubtotal,
        feeAmount,
        platformCommissionRate: commRate,
        platformCommissionAmount: commAmount,
        finalAmount,
      },
    };
  }

  async getUserInstallmentsCalendar(userId: string) {
    return await this.dataSource.getRepository(Installment).find({
      where: { order: { user: { id: userId } } },
      relations: ['order', 'order.store'],
      order: { dueDate: 'ASC' },
    });
  }

  async getStoreReceivables(storeId: string, storeOwnerId: string) {
    const store = await this.storeRepository.findOne({
      where: { id: storeId },
      relations: ['owner'],
    });
    if (!store) {
      throw new NotFoundException(`Tienda con ID ${storeId} no encontrada`);
    }
    if (!store.owner || store.owner.id !== storeOwnerId) {
      throw new ForbiddenException(
        'No tienes permiso para ver la tesorería de esta tienda',
      );
    }

    return await this.dataSource.getRepository(Installment).find({
      where: {
        order: {
          store: { id: storeId },
          status: Not(In([OrderStatus.CANCELLED, OrderStatus.REJECTED])),
        },
        status: In([InstallmentStatus.PENDING, InstallmentStatus.OVERDUE]),
      },
      relations: [
        'order',
        'order.user',
        'order.payments',
        'order.installments',
        'order.orderItems',
      ],
      order: { dueDate: 'ASC' },
    });
  }

  async getOrderStatement(orderId: string, userId: string, userRole: string) {
    const order = await this.orderRepository.findOne({
      where: { id: orderId },
      relations: [
        'user',
        'store',
        'store.owner',
        'orderItems',
        'payments',
        'installments',
      ],
      order: {
        installments: { dueDate: 'ASC' },
        payments: { createdAt: 'DESC' },
      },
    });

    if (!order) {
      throw new NotFoundException(`Orden con ID ${orderId} no encontrada`);
    }

    // Verificar accesos (comercio o cliente)
    const isCustomer = order.user.id === userId;
    const isMerchant = order.store.owner?.id === userId;

    if (!isCustomer && !isMerchant && userRole !== 'ADMIN') {
      throw new ForbiddenException(
        'No tienes permiso para ver el estado de cuenta de esta orden',
      );
    }

    return {
      orderId: order.id,
      createdAt: order.createdAt,
      totalAmount: parseFloat(order.totalAmount.toString()),
      feeAmount: parseFloat(order.feeAmount.toString()),
      platformCommissionRate: parseFloat(
        (order.platformCommissionRate || 0).toString(),
      ),
      platformCommissionAmount: parseFloat(
        (order.platformCommissionAmount || 0).toString(),
      ),
      finalAmount: parseFloat(order.finalAmount.toString()),
      totalPaidAmount: parseFloat(order.totalPaidAmount.toString()),
      remainingBalance: parseFloat(order.remainingBalance.toString()),
      isFullyPaid: order.isFullyPaid,
      status: order.status,
      store: {
        id: order.store.id,
        name: order.store.name,
        logo: order.store.logo,
      },
      user: {
        id: order.user.id,
        name: `${order.user.firstName} ${order.user.lastName}`.trim(),
      },
      items: order.orderItems.map((oi) => ({
        title: oi.title,
        quantity: oi.quantity,
        price: parseFloat(oi.price.toString()),
      })),
      installments: order.installments.map((inst) => ({
        id: inst.id,
        amount: parseFloat(inst.amount.toString()),
        paidAmount: parseFloat((inst.paidAmount || 0).toString()),
        lateFeeApplied: parseFloat((inst.lateFeeApplied || 0).toString()),
        dueDate: inst.dueDate,
        status: inst.status,
        extensionStatus: inst.extensionStatus,
      })),
      payments: order.payments.map((p) => ({
        id: p.id,
        amount: parseFloat(p.amount.toString()),
        reference: p.reference,
        status: p.status,
        paymentDate: p.createdAt,
        paymentMethod: p.paymentMethod,
      })),
    };
  }

  async registerManualPayment(
    orderId: string,
    dto: ManualPaymentDto,
    storeOwnerId: string,
  ) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const order = await queryRunner.manager.findOne(Order, {
        where: { id: orderId },
        relations: ['store', 'store.owner', 'store.company', 'user', 'payments', 'installments'],
        lock: { mode: 'pessimistic_write' },
      });

      if (!order) {
        throw new NotFoundException(`Orden #${orderId} no encontrada`);
      }

      if (!order.store.owner || order.store.owner.id !== storeOwnerId) {
        throw new ForbiddenException(
          'No tienes permiso para registrar pagos en esta orden',
        );
      }

      if (
        order.status === OrderStatus.CANCELLED ||
        order.status === OrderStatus.REJECTED
      ) {
        throw new BadRequestException(
          'No se pueden registrar pagos en una orden cancelada o rechazada',
        );
      }

      const currentBalance = parseFloat(
        (order.remainingBalance !== null && order.remainingBalance !== undefined
          ? order.remainingBalance
          : order.balance
        ).toString(),
      );

      if (currentBalance <= 0 || order.isFullyPaid) {
        throw new BadRequestException(
          'Esta orden ya está completamente pagada',
        );
      }

      const paymentAmount =
        Math.round(parseFloat(dto.amount.toString()) * 100) / 100;
      if (paymentAmount <= 0) {
        throw new BadRequestException('El monto debe ser mayor a cero');
      }

      if (paymentAmount > currentBalance) {
        throw new BadRequestException(
          `El monto ingresado ($${paymentAmount.toFixed(2)}) supera el saldo restante de la orden ($${currentBalance.toFixed(2)})`,
        );
      }

      // Determine installment index if applicable
      let installmentIndex: number | null = null;
      if (order.isPartialPayment && order.installments?.length > 0) {
        const sortedInstallments = [...order.installments].sort(
          (a, b) =>
            new Date(a.dueDate || a.createdAt).getTime() -
            new Date(b.dueDate || b.createdAt).getTime(),
        );
        const nextPending = sortedInstallments.find(
          (inst) => inst.status !== InstallmentStatus.PAID,
        );
        if (nextPending) {
          installmentIndex = sortedInstallments.indexOf(nextPending) + 1;
        }
      }

      // Create approved payment
      const payment = queryRunner.manager.create(Payment, {
        amount: paymentAmount,
        currency: 'USD',
        paymentMethod: dto.paymentMethod,
        reference: dto.reference || `CAJA-${Date.now().toString().slice(-6)}`,
        status: PaymentStatus.APPROVED,
        order,
        user: order.user,
        store: order.store,
        installmentIndex,
      });

      const savedPayment = await queryRunner.manager.save(payment);

      // Update Order balance
      const newBalanceRaw = currentBalance - paymentAmount;
      const newBalance =
        Math.round(newBalanceRaw * 100) <= 1
          ? 0
          : Math.round(newBalanceRaw * 100) / 100;

      order.totalPaidAmount =
        parseFloat((order.totalPaidAmount || 0).toString()) + paymentAmount;
      order.remainingBalance = newBalance;
      order.balance = newBalance;

      // Amortize installments if partial payment
      if (order.isPartialPayment && order.installments?.length > 0) {
        const installments = [...order.installments].sort(
          (a, b) =>
            new Date(a.dueDate || a.createdAt).getTime() -
            new Date(b.dueDate || b.createdAt).getTime(),
        );

        const allApprovedPayments = [
          ...(order.payments || []).filter(
            (p) => p.status === PaymentStatus.APPROVED,
          ),
          savedPayment,
        ].sort(
          (a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        );

        let totalApprovedCents = allApprovedPayments.reduce(
          (sum, p) => sum + Math.round(parseFloat(p.amount.toString()) * 100),
          0,
        );

        const isFullySettled = newBalance === 0;

        if (isFullySettled) {
          for (const inst of installments) {
            inst.paidAmount = inst.amount;
            inst.status = InstallmentStatus.PAID;
            if (!inst.paymentDate) {
              inst.paymentDate = new Date();
            }
            await queryRunner.manager.save(inst);
          }
        } else {
          for (const inst of installments) {
            const origAmountCents = Math.round(
              parseFloat(inst.amount.toString()) * 100,
            );
            const lateFeeCents = Math.round(
              parseFloat((inst.lateFeeApplied || 0).toString()) * 100,
            );
            const neededCents = origAmountCents + lateFeeCents;

            if (totalApprovedCents >= neededCents - 1) {
              totalApprovedCents -= neededCents;
              inst.paidAmount = inst.amount;
              inst.status = InstallmentStatus.PAID;
              if (!inst.paymentDate) {
                inst.paymentDate = new Date();
              }
              await queryRunner.manager.save(inst);
            } else {
              const paidVal = Math.round(totalApprovedCents) / 100;
              totalApprovedCents = 0;
              inst.paidAmount = paidVal;
              if (inst.status !== InstallmentStatus.OVERDUE) {
                inst.status = InstallmentStatus.PENDING;
              }
              await queryRunner.manager.save(inst);
            }
          }
        }
      }

      if (newBalance === 0) {
        order.isFullyPaid = true;
        order.status = OrderStatus.FULLY_PAID;
      } else if (order.status === OrderStatus.PENDING) {
        order.status = OrderStatus.PARTIALLY_PAID;
      }

      await queryRunner.manager.save(order);
      await queryRunner.commitTransaction();

      const companyId =
        order.store?.company?.id || (order.store as any)?.companyId;
      if (companyId) {
        this.activityLogService.log({
          companyId,
          storeId: order.store?.id,
          user: order.store?.owner || { id: storeOwnerId, firstName: 'Comercio' },
          module: ActivityLogModule.ORDERS,
          action: 'ORDER_PAYMENT_REGISTERED',
          description: `Registró un pago manual de \$${paymentAmount.toFixed(2)} en la orden #${order.id.split('-')[0].toUpperCase()}. Estado: ${order.status}.`,
          metadata: {
            orderId: order.id,
            amount: paymentAmount,
            status: order.status,
          },
        });
      }

      try {
        if (newBalance === 0 && order.store?.id) {
          await this.rankingService.processEvent(
            order.store.id,
            RankingEventType.ORDER_COMPLETED,
            order.id,
            order.user?.id,
          );
        }
      } catch (rankErr) {
        this.logger.error(
          `Error processing ranking on manual payment completion: ${rankErr.message}`,
        );
      }

      try {
        this.notificationService.notifyStoreInstallmentsUpdated(
          order.store.id,
          {
            orderId: order.id,
            paymentId: savedPayment.id,
          },
        );
      } catch (notifyErr) {
        this.logger.error(
          `Error emitting store installments updated on manual payment: ${notifyErr}`,
        );
      }

      return {
        success: true,
        orderId: order.id,
        paymentId: savedPayment.id,
        paymentAmount,
        newBalance: order.remainingBalance,
        isFullyPaid: order.isFullyPaid,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async markPreOrderStockArrived(orderId: string, user: User) {
    const order = await this.orderRepository.findOne({
      where: { id: orderId },
      relations: [
        'store',
        'store.owner',
        'user',
        'orderItems',
        'orderItems.item',
        'orderItems.item.preorderConfig',
      ],
    });

    if (!order) {
      throw new NotFoundException(`Orden con ID ${orderId} no encontrada`);
    }

    if (order.store?.owner?.id !== user.id) {
      throw new ForbiddenException(
        'No tienes permiso para actualizar esta orden',
      );
    }

    const preorderItem = order.orderItems?.find(
      (oi) => oi.item?.preorderConfig,
    );
    const settlementHours =
      preorderItem?.item?.preorderConfig?.settlementWindowHours || 48;

    order.preOrderStatus = PreOrderStatus.READY_FOR_SETTLEMENT;
    order.settlementDeadline = new Date(
      Date.now() + settlementHours * 3600 * 1000,
    );

    const savedOrder = await this.orderRepository.save(order);

    try {
      if (order.user?.id) {
        await this.notificationService.create({
          userId: order.user.id,
          storeId: order.store.id,
          orderId: order.id,
          type: NotificationType.GENERAL,
          title: '¡Tu pedido bajo demanda ya llegó!',
          body: `Tu artículo en la tienda "${order.store.name}" ya está listo para retiro o liquidación. Tienes ${settlementHours} horas para completar tu orden.`,
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Error enviando notificación de llegada de stock: ${msg}`,
      );
    }

    return savedOrder;
  }
}
