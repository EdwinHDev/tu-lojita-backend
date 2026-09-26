import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrderDispute } from './entities/order-dispute.entity';
import { Order } from 'src/order/entities/order.entity';
import { OrderDisputeService } from './order-dispute.service';
import { OrderDisputeController } from './order-dispute.controller';
import { NotificationModule } from '../notification/notification.module';
import { RankingModule } from '../ranking/ranking.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([OrderDispute, Order]),
    NotificationModule,
    RankingModule,
  ],
  controllers: [OrderDisputeController],
  providers: [OrderDisputeService],
  exports: [OrderDisputeService],
})
export class OrderDisputeModule {}
