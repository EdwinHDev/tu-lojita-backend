import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, In, Not } from 'typeorm';
import { CreateOrderDto } from './dto/create-order.dto';
import { ValidateCartDto } from './dto/validate-cart.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { ManualPaymentDto } from './dto/manual-payment.dto';
import { Order } from './entities/order.entity';
import { Store } from 'src/store/entities/store.entity';
import { StoreStatus } from 'src/store/types/status.enum';
import { Item } from 'src/item/entities/item.entity';
import { OrderItem } from 'src/order-item/entities/order-item.entity';
import { User } from 'src/user/entities/user.entity';
import { UserRole } from 'src/user/types/user-role.enum';
import { OrderStatus, InstallmentStatus, ExtensionStatus } from './types';
import { Installment } from './entities/installment.entity';
import { OrderPaginationDto } from './dto/order-pagination.dto';
import { NotificationService } from 'src/notification/notification.service';
import { NotificationType } from 'src/notification/entities/notification.entity';
import { MailService } from 'src/common/mail/mail.service';
import { InstallmentPeriod } from 'src/store/types/installment-period.enum';
import { Payment } from 'src/payment/entities/payment.entity';
import { PaymentStatus } from 'src/payment/types/payment-status.enum';
import { CommissionService } from 'src/commission/commission.service';

@Injectable()
export class OrderService {
  constructor(
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,

    @InjectRepository(Store)
    private readonly storeRepository: Repository<Store>,

    @InjectRepository(Item)
    private readonly itemRepository: Repository<Item>,

    @InjectRepository(User)
    private readonly userRepository: Repository<User>,

    private readonly dataSource: DataSource,
    private readonly notificationService: NotificationService,
    private readonly mailService: MailService,
    private readonly commissionService: CommissionService,
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

    // Iniciar Transacción Atómica
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
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

      // 3. Validar items duplicados en la petición (Seguridad de Datos)
      const itemIds = itemsDto.map((i) => i.itemId);
      const uniqueItemIds = new Set(itemIds);
      if (uniqueItemIds.size !== itemIds.length) {
        throw new BadRequestException(
          'La orden contiene items duplicados. Por favor, agrupa las cantidades.',
        );
      }

      let subtotal = 0;
      const orderItemsToSave: OrderItem[] = [];

      // 4. Procesar items y validar stock
      for (const itemDto of itemsDto) {
        const item = await queryRunner.manager.findOne(Item, {
          where: { id: itemDto.itemId },
          relations: [
            'store',
            'customizationGroupsRel',
            'customizationGroupsRel.options',
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

        // Comprobar inventario si el item lo requiere (Producto físico)
        if (item.trackInventory) {
          const currentStock = parseFloat(
            item.stockQuantity?.toString() || '0',
          );
          if (currentStock < itemDto.quantity) {
            throw new BadRequestException(
              `Stock insuficiente para "${item.title}". Disponible: ${currentStock}`,
            );
          }
          // Restar stock
          item.stockQuantity = currentStock - itemDto.quantity;
          await queryRunner.manager.save(item);
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

        // Determinar precio base (prioridad a discountPrice si existe)
        const basePrice = item.discountPrice
          ? parseFloat(item.discountPrice.toString())
          : parseFloat(item.price.toString());

        const totalLinePrice =
          basePrice * itemDto.quantity + customizationExtra;
        const priceAtOrder =
          itemDto.quantity > 0
            ? totalLinePrice / itemDto.quantity
            : totalLinePrice;

        // Usar redondeo a 2 decimales para evitar errores de coma flotante en el subtotal
        subtotal = Math.round((subtotal + totalLinePrice) * 100) / 100;

        // Preparar OrderItem (Snapshot)
        const orderItem = queryRunner.manager.create(OrderItem, {
          item,
          title: item.title, // Snapshot del nombre
          quantity: itemDto.quantity,
          price: priceAtOrder,
          selectedOptions: itemDto.selectedOptions,
        });
        orderItemsToSave.push(orderItem);
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
            this.logger.error(
              `Error sending confirmation email: ${msg}`,
            );
          });
      }

      // Notificar al dueño del comercio sobre la nueva orden y actualizar tiempo real
      try {
        const storeOwnerId =
          finalOrder.store?.owner?.id ||
          (finalOrder.store?.company as any)?.owner?.id;
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
        this.notificationService.notifyStoreInstallmentsUpdated(finalOrder.store.id, {
          orderId: finalOrder.id,
        });
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
        'orderItems.item.store',
        'orderItems.item.store.subcategory',
        'orderItems.item.customizationGroupsRel',
        'orderItems.item.customizationGroupsRel.options',
        'installments',
      ],
      order: {
        installments: {
          dueDate: 'ASC',
        },
      },
    });
    if (!order) throw new NotFoundException(`Orden #${id} no encontrada`);
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
    } = paginationDto;

    const queryBuilder = this.orderRepository
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.store', 'store')
      .leftJoinAndSelect('store.subcategory', 'subcategory')
      .leftJoinAndSelect('order.user', 'user')
      .leftJoinAndSelect('user.addresses', 'addresses')
      .leftJoinAndSelect('order.orderItems', 'orderItems')
      .leftJoinAndSelect('orderItems.item', 'item')
      .leftJoinAndSelect(
        'item.customizationGroupsRel',
        'customizationGroupsRel',
      )
      .leftJoinAndSelect('customizationGroupsRel.options', 'options')
      .leftJoinAndSelect('order.payments', 'payments')
      .leftJoinAndSelect('order.installments', 'installments');

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
        queryBuilder.andWhere('store.companyId = :authCompanyId', {
          authCompanyId: requestingUser.company.id,
        });
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

  async cancelOrder(id: string, userId: string) {
    const order = await this.findOne(id);

    // Validar Seguridad: Solo el dueño de la orden puede cancelarla
    if (order.user.id !== userId) {
      throw new BadRequestException(
        'No tienes permiso para cancelar esta orden',
      );
    }

    if (order.status === OrderStatus.CANCELLED) {
      throw new BadRequestException('Esta orden ya está cancelada');
    }

    if (order.status === OrderStatus.FULLY_PAID) {
      throw new BadRequestException(
        'No se puede cancelar una orden que ya ha sido pagada en su totalidad',
      );
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 1. Devolver Stock
      for (const orderItem of order.orderItems) {
        const item = orderItem.item;
        if (item.trackInventory) {
          const currentStock = parseFloat(
            item.stockQuantity?.toString() || '0',
          );
          item.stockQuantity = currentStock + orderItem.quantity;
          await queryRunner.manager.save(item);
        }
      }

      // 2. Cambiar estado
      order.status = OrderStatus.CANCELLED;
      await queryRunner.manager.save(order);

      // Anular comisión de la plataforma
      await this.commissionService.voidOrderCommission(
        order,
        queryRunner.manager,
      );

      await queryRunner.commitTransaction();
      return {
        message: 'Orden cancelada y stock devuelto exitosamente',
        orderId: id,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
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
            const currentStock = parseFloat(
              item.stockQuantity?.toString() || '0',
            );
            item.stockQuantity = currentStock + orderItem.quantity;
            await cancelQueryRunner.manager.save(item);
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
          title: 'Solicitud de Prórroga',
          body: `El cliente ${clientName} ha solicitado una prórroga de ${requestedDays} días para una cuota de la orden #${installment.order.id.split('-')[0].toUpperCase()}.`,
          type: NotificationType.GENERAL,
          orderId: installment.order.id,
        });
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.error(
        `Error sending notification to store owner: ${msg}`,
      );
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

      // Validar stock
      if (item.trackInventory) {
        const currentStock = parseFloat(item.stockQuantity?.toString() || '0');
        if (currentStock < itemDto.quantity) {
          errors.push({
            itemId: itemDto.itemId,
            code: 'OUT_OF_STOCK',
            message: `Stock insuficiente para "${item.title}". Disponible: ${currentStock}`,
          });
        }
      }

      // Validar cambio de precio
      if (itemDto.priceAtCart !== undefined && itemDto.priceAtCart !== null) {
        const currentPrice = parseFloat(item.price?.toString() || '0');
        const cartPrice = parseFloat(itemDto.priceAtCart.toString());
        if (Math.abs(currentPrice - cartPrice) > 0.001) {
          errors.push({
            itemId: itemDto.itemId,
            code: 'PRICE_CHANGED',
            message: `El precio de "${item.title}" cambió de $${cartPrice.toFixed(2)} a $${currentPrice.toFixed(2)}.`,
            currentPrice,
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

      const basePrice = item.discountPrice
        ? parseFloat(item.discountPrice.toString())
        : parseFloat(item.price.toString());
      const totalLinePrice = basePrice * itemDto.quantity + customizationExtra;
      calculatedSubtotal =
        Math.round((calculatedSubtotal + totalLinePrice) * 100) / 100;
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
        relations: [
          'store',
          'store.owner',
          'user',
          'payments',
          'installments',
        ],
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
        throw new BadRequestException('Esta orden ya está completamente pagada');
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

      try {
        this.notificationService.notifyStoreInstallmentsUpdated(order.store.id, {
          orderId: order.id,
          paymentId: savedPayment.id,
        });
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
}
