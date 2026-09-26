import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReviewService } from './review.service';
import { ReviewController } from './review.controller';
import { OrderReview } from './entities/order-review.entity';
import { BuyerReview } from './entities/buyer-review.entity';
import { Order } from 'src/order/entities/order.entity';
import { Item } from 'src/item/entities/item.entity';
import { User } from 'src/user/entities/user.entity';
import { Store } from 'src/store/entities/store.entity';
import { NotificationModule } from 'src/notification/notification.module';
import { RankingModule } from 'src/ranking/ranking.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([OrderReview, BuyerReview, Order, Item, User, Store]),
    NotificationModule,
    RankingModule,
  ],
  controllers: [ReviewController],
  providers: [ReviewService],
  exports: [ReviewService],
})
export class ReviewModule {}
