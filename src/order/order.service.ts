import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { Order } from './entities/order.entity';
import { Store } from 'src/store/entities/store.entity';
import { Item } from 'src/item/entities/item.entity';
import { OrderItem } from 'src/order-item/entities/order-item.entity';
import { User } from 'src/user/entities/user.entity';
import { OrderStatus } from './types';
import { OrderPaginationDto } from './dto/order-pagination.dto';

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
  ) { }

  async create(createOrderDto: CreateOrderDto) {
    const { storeId, userId, items: itemsDto, isPartialPayment = false } = createOrderDto;

    // 1. Validar Tienda
    const store = await this.storeRepository.findOneBy({ id: storeId });
    if (!store) throw new NotFoundException(`Tienda con ID ${storeId} no encontrada`);

    // 2. Validar Usuario (Cliente)
    const user = await this.userRepository.findOneBy({ id: userId });
    if (!user) throw new NotFoundException(`Usuario con ID ${userId} no encontrado`);

    // Iniciar Transacción Atómica
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 3. Validar items duplicados en la petición (Seguridad de Datos)
      const itemIds = itemsDto.map(i => i.itemId);
      const uniqueItemIds = new Set(itemIds);
      if (uniqueItemIds.size !== itemIds.length) {
        throw new BadRequestException('La orden contiene items duplicados. Por favor, agrupa las cantidades.');
      }

      let subtotal = 0;
      const orderItemsToSave: OrderItem[] = [];

      // 4. Procesar items y validar stock
      for (const itemDto of itemsDto) {
        const item = await queryRunner.manager.findOne(Item, { where: { id: itemDto.itemId } });
        if (!item) throw new NotFoundException(`Item con ID ${itemDto.itemId} no encontrado`);

        // Comprobar inventario si el item lo requiere (Producto físico)
        if (item.trackInventory) {
          const currentStock = parseFloat(item.stockQuantity?.toString() || '0');
          if (currentStock < itemDto.quantity) {
            throw new BadRequestException(`Stock insuficiente para "${item.title}". Disponible: ${currentStock}`);
          }
          // Restar stock
          item.stockQuantity = currentStock - itemDto.quantity;
          await queryRunner.manager.save(item);
        }

        // Determinar precio (prioridad a discountPrice si existe)
        const priceAtOrder = item.discountPrice ? parseFloat(item.discountPrice.toString()) : parseFloat(item.price.toString());
        
        // Usar redondeo a 2 decimales para evitar errores de coma flotante en el subtotal
        subtotal = Math.round((subtotal + (priceAtOrder * itemDto.quantity)) * 100) / 100;

        // Preparar OrderItem (Snapshot)
        const orderItem = queryRunner.manager.create(OrderItem, {
          item,
          title: item.title, // Snapshot del nombre
          quantity: itemDto.quantity,
          price: priceAtOrder,
        });
        orderItemsToSave.push(orderItem);
      }

      // 5. Lógica de recargos por pago parcial (Fase 4 extendida)
      let feeAmount = 0;
      if (isPartialPayment) {
        if (!store.allowPartialPayments) {
          throw new BadRequestException('Esta tienda no admite pagos parciales');
        }
        const feePercent = parseFloat(store.partialPaymentsFeePercentage.toString());
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

      const savedOrder = await queryRunner.manager.save(order);

      // 7. Relacionar y guardar los items de la orden
      for (const oi of orderItemsToSave) {
        oi.order = savedOrder;
        await queryRunner.manager.save(oi);
      }

      await queryRunner.commitTransaction();

      // Retornar la orden con sus items cargados
      return await this.findOne(savedOrder.id);

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
        'store.subcategory',
        'payments', 
        'user', 
        'orderItems', 
        'orderItems.item',
        'orderItems.item.store',
        'orderItems.item.store.subcategory',
      ]
    });
    if (!order) throw new NotFoundException(`Orden #${id} no encontrada`);
    return order;
  }

  async findAll(paginationDto: OrderPaginationDto) {
    const { status, userId, storeId, isPartialPayment, hasBalance, startDate, endDate, limit, offset, sort, order } = paginationDto;

    const queryBuilder = this.orderRepository.createQueryBuilder('order')
      .leftJoinAndSelect('order.store', 'store')
      .leftJoinAndSelect('order.user', 'user');

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
      queryBuilder.andWhere('order.isPartialPayment = :isPartialPayment', { isPartialPayment });
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

    // Ordenamiento Dinámico
    const validSortFields = ['createdAt', 'totalAmount', 'balance', 'finalAmount'];
    const sortField = validSortFields.includes(sort as string) ? `order.${sort}` : 'order.createdAt';
    queryBuilder.orderBy(sortField, order || 'DESC');

    // Paginación
    queryBuilder.skip(offset).take(limit);

    const [items, total] = await queryBuilder.getManyAndCount();

    return {
      items,
      total,
      limit,
      offset
    };
  }

  async cancelOrder(id: string, userId: string) {
    const order = await this.findOne(id);

    // Validar Seguridad: Solo el dueño de la orden puede cancelarla
    if (order.user.id !== userId) {
      throw new BadRequestException('No tienes permiso para cancelar esta orden');
    }

    if (order.status === OrderStatus.CANCELLED) {
      throw new BadRequestException('Esta orden ya está cancelada');
    }

    if (order.status === OrderStatus.FULLY_PAID) {
      throw new BadRequestException('No se puede cancelar una orden que ya ha sido pagada en su totalidad');
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 1. Devolver Stock
      for (const orderItem of order.orderItems) {
        const item = orderItem.item;
        if (item.trackInventory) {
          const currentStock = parseFloat(item.stockQuantity?.toString() || '0');
          item.stockQuantity = currentStock + orderItem.quantity;
          await queryRunner.manager.save(item);
        }
      }

      // 2. Cambiar estado
      order.status = OrderStatus.CANCELLED;
      await queryRunner.manager.save(order);

      await queryRunner.commitTransaction();
      return { message: 'Orden cancelada y stock devuelto exitosamente', orderId: id };

    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async update(id: string, updateOrderDto: UpdateOrderDto) {
    const order = await this.findOne(id);
    this.orderRepository.merge(order, updateOrderDto);
    return await this.orderRepository.save(order);
  }

  async remove(id: string) {
    const order = await this.findOne(id);
    await this.orderRepository.remove(order);
    return { deleted: true };
  }
}
