import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrderService } from './order.service';
import { OrderController } from './order.controller';
import { Order } from './entities/order.entity';
import { Store } from 'src/store/entities/store.entity';
import { Item } from 'src/item/entities/item.entity';
import { OrderItem } from 'src/order-item/entities/order-item.entity';
import { User } from 'src/user/entities/user.entity';
import { NotificationModule } from 'src/notification/notification.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order, Store, Item, OrderItem, User]),
    NotificationModule,
  ],
  controllers: [OrderController],
  providers: [OrderService],
  exports: [OrderService],
})
export class OrderModule {}
