import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommissionConfigRange } from './entities/commission-config-range.entity';
import { CommissionSettings } from './entities/commission-settings.entity';
import { StoreCommissionBilling } from './entities/store-commission-billing.entity';
import { CommissionPaymentReport } from './entities/commission-payment-report.entity';
import { PlatformPaymentMethod } from './entities/platform-payment-method.entity';
import { Store } from 'src/store/entities/store.entity';
import { Order } from 'src/order/entities/order.entity';
import { CommissionService } from './commission.service';
import { StoreCommissionBillingService } from './commission-billing.service';
import { CommissionController } from './commission.controller';
import { PlatformPaymentMethodController } from './platform-payment-method.controller';
import { FinancialAuthModule } from 'src/financial-auth/financial-auth.module';
import { MailModule } from 'src/common/mail/mail.module';
import { CommissionBillingCron } from './cron/commission-billing.cron';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CommissionConfigRange,
      CommissionSettings,
      StoreCommissionBilling,
      CommissionPaymentReport,
      PlatformPaymentMethod,
      Store,
      Order,
    ]),
    FinancialAuthModule,
    MailModule,
  ],
  controllers: [CommissionController, PlatformPaymentMethodController],
  providers: [
    CommissionService,
    StoreCommissionBillingService,
    CommissionBillingCron,
  ],
  exports: [CommissionService, StoreCommissionBillingService, TypeOrmModule],
})
export class CommissionModule {}
