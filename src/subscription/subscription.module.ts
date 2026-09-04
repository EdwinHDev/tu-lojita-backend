import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SubscriptionSettings } from './entities/subscription-settings.entity';
import { CompanySubscription } from './entities/company-subscription.entity';
import { SubscriptionPayment } from './entities/subscription-payment.entity';
import { Company } from 'src/company/entities/company.entity';
import { User } from 'src/user/entities/user.entity';
import { Store } from 'src/store/entities/store.entity';
import { PlatformPaymentMethod } from 'src/commission/entities/platform-payment-method.entity';
import { CompanySubscriptionService } from './subscription.service';
import { SubscriptionController } from './subscription.controller';
import { FinancialAuthModule } from 'src/financial-auth/financial-auth.module';
import { MailModule } from 'src/common/mail/mail.module';
import { SubscriptionCron } from './cron/subscription.cron';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SubscriptionSettings,
      CompanySubscription,
      SubscriptionPayment,
      Company,
      User,
      Store,
      PlatformPaymentMethod,
    ]),
    FinancialAuthModule,
    MailModule,
  ],
  controllers: [SubscriptionController],
  providers: [CompanySubscriptionService, SubscriptionCron],
  exports: [CompanySubscriptionService, TypeOrmModule],
})
export class SubscriptionModule {}
