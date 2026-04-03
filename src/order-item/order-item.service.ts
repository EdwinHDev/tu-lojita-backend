import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OrderItem } from './entities/order-item.entity';
import { OrderItemPaginationDto } from './dto/order-item-pagination.dto';

@Injectable()
export class OrderItemService {

  constructor(
    @InjectRepository(OrderItem)
    private readonly orderItemRepository: Repository<OrderItem>,
  ) {}

  async findAll(paginationDto: OrderItemPaginationDto) {
    const { orderId, storeId, itemId, limit, offset, sort, order } = paginationDto;

    const queryBuilder = this.orderItemRepository.createQueryBuilder('orderItem')
      .leftJoinAndSelect('orderItem.order', 'order')
      .leftJoinAndSelect('orderItem.item', 'item')
      .leftJoinAndSelect('order.store', 'store')
      .leftJoinAndSelect('order.user', 'user');

    if (orderId) {
      queryBuilder.andWhere('order.id = :orderId', { orderId });
    }

    if (storeId) {
      queryBuilder.andWhere('store.id = :storeId', { storeId });
    }

    if (itemId) {
      queryBuilder.andWhere('item.id = :itemId', { itemId });
    }

    const validSortFields = ['createdAt', 'price', 'quantity'];
    const sortField = validSortFields.includes(sort as string) ? `orderItem.${sort}` : 'orderItem.createdAt';
    queryBuilder.orderBy(sortField, order || 'DESC');

    queryBuilder.skip(offset).take(limit);

    const [items, total] = await queryBuilder.getManyAndCount();

    return {
      items,
      total,
      limit,
      offset
    };
  }

  async findByOrder(orderId: string) {
    return await this.orderItemRepository.find({
      where: { order: { id: orderId } },
      relations: ['item']
    });
  }

  async findOne(id: string) {
    const orderItem = await this.orderItemRepository.findOne({
      where: { id },
      relations: ['order', 'item', 'order.store']
    });

    if (!orderItem) throw new NotFoundException(`Item de orden #${id} no encontrado`);
    return orderItem;
  }
}
