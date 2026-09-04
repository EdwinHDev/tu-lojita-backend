import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrderService } from './order.service';
import { OrderController } from './order.controller';
import { Order } from './entities/order.entity';
import { Installment } from './entities/installment.entity';
import { Store } from 'src/store/entities/store.entity';
import { Item } from 'src/item/entities/item.entity';
import { OrderItem } from 'src/order-item/entities/order-item.entity';
import { User } from 'src/user/entities/user.entity';
import { NotificationModule } from 'src/notification/notification.module';
import { Payment } from 'src/payment/entities/payment.entity';
import { DebtCollectionCron } from './cron/debt-collection.cron';
import { OrderAutoCancellationCron } from './cron/order-auto-cancellation.cron';
import { CommissionModule } from 'src/commission/commission.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Order,
      Installment,
      Store,
      Item,
      OrderItem,
      User,
      Payment,
    ]),
    NotificationModule,
    CommissionModule,
  ],
  controllers: [OrderController],
  providers: [OrderService, DebtCollectionCron, OrderAutoCancellationCron],
  exports: [OrderService],
})
export class OrderModule {}
