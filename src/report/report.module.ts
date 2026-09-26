import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReportService } from './report.service';
import { ReportController } from './report.controller';
import { Report } from './entities/report.entity';
import { Store } from 'src/store/entities/store.entity';
import { Item } from 'src/item/entities/item.entity';
import { StoreStrike } from 'src/store/entities/store-strike.entity';
import { NotificationModule } from 'src/notification/notification.module';
import { MailModule } from 'src/common/mail/mail.module';
import { RankingModule } from 'src/ranking/ranking.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Report, Store, Item, StoreStrike]),
    NotificationModule,
    MailModule,
    RankingModule,
  ],
  controllers: [ReportController],
  providers: [ReportService],
  exports: [ReportService, TypeOrmModule],
})
export class ReportModule {}
