import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StoreRanking } from './entities/store-ranking.entity';
import { RankingEvent } from './entities/ranking-event.entity';
import { RankingSettings } from './entities/ranking-settings.entity';
import { AchievementDefinition } from './entities/achievement-definition.entity';
import { StoreAchievementUnlock } from './entities/store-achievement-unlock.entity';
import { StoreAchievementShowcase } from './entities/store-achievement-showcase.entity';
import { Store } from 'src/store/entities/store.entity';
import { User } from 'src/user/entities/user.entity';
import { Order } from 'src/order/entities/order.entity';
import { OrderReview } from 'src/review/entities/order-review.entity';
import { OrderDispute } from 'src/order-dispute/entities/order-dispute.entity';
import { RankingService } from './services/ranking.service';
import { RankingSettingsService } from './services/ranking-settings.service';
import { AchievementService } from './services/achievement.service';
import { RankingCronService } from './services/ranking-cron.service';
import { RankingController } from './ranking.controller';
import { AdminRankingController } from './admin-ranking.controller';
import { NotificationModule } from 'src/notification/notification.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      StoreRanking,
      RankingEvent,
      RankingSettings,
      AchievementDefinition,
      StoreAchievementUnlock,
      StoreAchievementShowcase,
      Store,
      User,
      Order,
      OrderReview,
      OrderDispute,
    ]),
    forwardRef(() => NotificationModule),
  ],
  controllers: [RankingController, AdminRankingController],
  providers: [
    RankingService,
    RankingSettingsService,
    AchievementService,
    RankingCronService,
  ],
  exports: [RankingService, RankingSettingsService, AchievementService],
})
export class RankingModule {}
