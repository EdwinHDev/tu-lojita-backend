import { Module } from '@nestjs/common';
import { StoreService } from './store.service';
import { StoreController } from './store.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Store } from './entities/store.entity';
import { Company } from 'src/company/entities/company.entity';
import { Category } from 'src/category/entities/category.entity';
import { Subcategory } from 'src/subcategory/entities/subcategory.entity';
import { User } from 'src/user/entities/user.entity';
import { StoreAddress } from 'src/store-address/entities/store-address.entity';
import { Order } from 'src/order/entities/order.entity';
import { Item } from 'src/item/entities/item.entity';
import { StoreCategory } from 'src/store-category/entities/store-category.entity';

import { StoreCustomerBlock } from './entities/store-customer-block.entity';
import { MediationRequest } from './entities/mediation-request.entity';
import { StoreStrike } from './entities/store-strike.entity';
import { FinancialOtp } from 'src/financial-auth/entities/financial-otp.entity';
import { CompanyActivityLog } from 'src/company/entities/company-activity-log.entity';
import { Installment } from 'src/order/entities/installment.entity';
import { OrderDispute } from 'src/order-dispute/entities/order-dispute.entity';
import { NotificationModule } from 'src/notification/notification.module';
import { MailModule } from 'src/common/mail/mail.module';
import { PlatformSettingsModule } from 'src/platform-settings/platform-settings.module';
import { RankingModule } from 'src/ranking/ranking.module';
import { StoreAutoDeletionCron } from './cron/store-auto-deletion.cron';
import { StorePaymentMethod } from 'src/store-payment-method/entities/store-payment-method.entity';
import { CommissionPaymentReport } from 'src/commission/entities/commission-payment-report.entity';

@Module({
  imports: [
    NotificationModule,
    MailModule,
    PlatformSettingsModule,
    RankingModule,
    TypeOrmModule.forFeature([
      Store,
      Company,
      Category,
      Subcategory,
      User,
      StoreAddress,
      Order,
      Item,
      StoreCategory,
      StoreCustomerBlock,
      MediationRequest,
      StoreStrike,
      FinancialOtp,
      CompanyActivityLog,
      Installment,
      OrderDispute,
      StorePaymentMethod,
      CommissionPaymentReport,
    ]),
  ],
  controllers: [StoreController],
  providers: [StoreService, StoreAutoDeletionCron],
  exports: [StoreService, TypeOrmModule],
})
export class StoreModule {}
