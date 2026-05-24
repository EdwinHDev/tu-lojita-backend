import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, In } from 'typeorm';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { Order } from './entities/order.entity';
import { Store } from 'src/store/entities/store.entity';
import { StoreStatus } from 'src/store/types/status.enum';
import { Item } from 'src/item/entities/item.entity';
import { OrderItem } from 'src/order-item/entities/order-item.entity';
import { User } from 'src/user/entities/user.entity';
import { UserRole } from 'src/user/types/user-role.enum';
import { OrderStatus, InstallmentStatus } from './types';
import { Installment } from './entities/installment.entity';
import { OrderPaginationDto } from './dto/order-pagination.dto';
import { NotificationService } from 'src/notification/notification.service';
import { NotificationType } from 'src/notification/entities/notification.entity';
import { MailService } from 'src/common/mail/mail.service';
import { InstallmentPeriod } from 'src/store/types/installment-period.enum';

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
  ) {}

  private readonly logger = new Logger(OrderService.name);

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

        // Validar opciones (minSelect y maxSelect)
        if (item.customizationGroupsRel) {
          for (const group of item.customizationGroupsRel) {
            const selectedOptIds = itemDto.selectedOptions?.[group.id] || [];

            if (group.allowOptionQuantity) {
              const uniqueCount = new Set(selectedOptIds).size;
              if (group.minSelect > 0 && uniqueCount < group.minSelect) {
                throw new BadRequestException(
                  `Debes seleccionar al menos ${group.minSelect} opciones únicas para "${group.name}"`,
                );
              }
              if (group.maxSelect > 0 && uniqueCount > group.maxSelect) {
                throw new BadRequestException(
                  `Puedes seleccionar como máximo ${group.maxSelect} opciones únicas para "${group.name}"`,
                );
              }
            } else {
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
              for (const optId of optionIds) {
                const opt = group.options.find((o) => o.id === optId);
                if (opt) {
                  customizationExtra += parseFloat(opt.price.toString() || '0');
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

        if (store.installmentFrequencyOptions && store.installmentFrequencyOptions.length > 0) {
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

      const finalAmount = Math.round((subtotal + feeAmount) * 100) / 100;

      // 6. Crear y guardar la Orden
      const order = queryRunner.manager.create(Order, {
        store,
        user,
        totalAmount: subtotal,
        feeAmount,
        finalAmount,
        balance: finalAmount, // Deuda inicial
        isPartialPayment,
        status: OrderStatus.PENDING,
      });

      if (isPartialPayment) {
        const intervalValue = createOrderDto.installmentIntervalValue || store.installmentIntervalValue || 7;
        const intervalUnit = createOrderDto.installmentIntervalUnit || store.installmentIntervalUnit || InstallmentPeriod.DAYS;
        
        order.installmentIntervalValue = intervalValue;
        order.installmentIntervalUnit = intervalUnit;
        
        const nextDate = new Date();
        if (intervalUnit === InstallmentPeriod.DAYS) {
          nextDate.setDate(nextDate.getDate() + intervalValue);
        } else if (intervalUnit === InstallmentPeriod.WEEKS) {
          nextDate.setDate(nextDate.getDate() + (intervalValue * 7));
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
        const maxInstallments = parseInt(store.maxInstallments?.toString() || '1');
        const minInitialPercent = parseFloat(store.minInitialPaymentPercentage?.toString() || '0');
        
        // La primera cuota es el pago inicial mínimo
        const initialAmount = Math.round(((finalAmount * minInitialPercent) / 100) * 100) / 100;
        const remainingAmount = finalAmount - initialAmount;
        const otherInstallmentsCount = maxInstallments - 1;
        const monthlyAmount = otherInstallmentsCount > 0 
          ? Math.round((remainingAmount / otherInstallmentsCount) * 100) / 100 
          : 0;

        const installmentsToSave: Installment[] = [];
        const now = new Date();

        // Cuota 1: Inicial (Vence hoy)
        installmentsToSave.push(queryRunner.manager.create(Installment, {
          order: savedOrder,
          amount: initialAmount,
          dueDate: now,
          status: InstallmentStatus.PENDING,
        }));

        // Cuotas restantes basadas en la frecuencia elegida
        for (let i = 1; i < maxInstallments; i++) {
          const dueDate = new Date();
          const offset = i * (order.installmentIntervalValue || 1);
          
          if (order.installmentIntervalUnit === InstallmentPeriod.DAYS) {
            dueDate.setDate(now.getDate() + offset);
          } else if (order.installmentIntervalUnit === InstallmentPeriod.WEEKS) {
            dueDate.setDate(now.getDate() + (offset * 7));
          } else if (order.installmentIntervalUnit === InstallmentPeriod.MONTHS) {
            dueDate.setMonth(now.getMonth() + offset);
          }
          
          installmentsToSave.push(queryRunner.manager.create(Installment, {
            order: savedOrder,
            amount: monthlyAmount,
            dueDate: dueDate,
            status: InstallmentStatus.PENDING,
          }));
        }

        await queryRunner.manager.save(installmentsToSave);
      }

      await queryRunner.commitTransaction();

      // Trigger Notification to Store Owner
      const orderWithRelations = await this.findOne(savedOrder.id);
      const ownerId =
        orderWithRelations.store.owner?.id ||
        orderWithRelations.store.company?.owner?.id;

      /* 
      // Comentado para evitar ruido: El dueño solo recibirá notificación cuando se reporte el pago
      if (ownerId) {
        const firstItem = orderWithRelations.orderItems[0]?.title || 'un producto';
        const storeName = orderWithRelations.store.name;

        this.logger.log(
          `Sending notification to owner ${ownerId} for order ${savedOrder.id}`,
        );
        await this.notificationService.create({
          userId: ownerId,
          title: `¡Nueva Orden Recibida!`,
          body: `Compra de ${firstItem} en '${storeName}' por $${orderWithRelations.finalAmount}.`,
          type: NotificationType.ORDER_CREATED,
          targetId: savedOrder.id,
        });
      } else {
        this.logger.warn(`No owner found for store ${orderWithRelations.store.id} (Order ${savedOrder.id})`);
      }
      */

      // Retornar la orden con sus items cargados
      const finalOrder = await this.findOne(savedOrder.id);
      
      // Enviar confirmación por email de forma asíncrona (sin bloquear la respuesta)
      this.mailService.sendOrderConfirmation(finalOrder).catch(err => 
        this.logger.error(`Error sending confirmation email: ${err.message}`)
      );

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
                oi.item.customizationGroupsRel = fullItem.customizationGroupsRel;
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
    const updatedOrder = await this.orderRepository.save(order);

    // Trigger Notification to Customer if status changed
    if (updateOrderDto.status && updateOrderDto.status !== oldStatus) {
      let title = '';
      let body = '';
      let type = NotificationType.GENERAL;

      if (updateOrderDto.status === OrderStatus.FULLY_PAID) {
        title = '¡Tu pedido ha sido aprobado!';
        body = `Tu pedido #${order.id.split('-')[0].toUpperCase()} en ${order.store.name} ha sido aprobado y está siendo procesado.`;
        type = NotificationType.ORDER_APPROVED;
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

      if (updateOrderDto.status === OrderStatus.FULLY_PAID || updateOrderDto.status === OrderStatus.CANCELLED) {
        await this.notificationService.closeChatRoom(order.id, updateOrderDto.status === OrderStatus.FULLY_PAID ? 'approved' : 'rejected');
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
    return await this.dataSource.getRepository(Installment).find({
      where: {
        order: {
          store: { id: storeId }
        }
      },
      relations: ['order', 'order.user', 'order.store'],
      order: {
        dueDate: 'ASC'
      }
    });
  }
}
