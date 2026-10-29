import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { MailerModule } from '@nestjs-modules/mailer';
import { TypeOrmModule } from '@nestjs/typeorm';
import { envs } from './config/envs';
import { AuthModule } from './auth/auth.module';
import { UserModule } from './user/user.module';
import { AddressModule } from './address/address.module';
import { CompanyModule } from './company/company.module';
import { StoreModule } from './store/store.module';
import { CategoryModule } from './category/category.module';
import { ItemModule } from './item/item.module';
import { StoreCategoryModule } from './store-category/store-category.module';
import { SubcategoryModule } from './subcategory/subcategory.module';
import { StoreAddressModule } from './store-address/store-address.module';
import { PaymentModule } from './payment/payment.module';
import { OrderModule } from './order/order.module';
import { OrderItemModule } from './order-item/order-item.module';
import { NotificationModule } from './notification/notification.module';
import { BankModule } from './bank/bank.module';
import { StorePaymentMethodModule } from './store-payment-method/store-payment-method.module';
import { MailModule } from './common/mail/mail.module';
import { CommissionModule } from './commission/commission.module';
import { SubscriptionModule } from './subscription/subscription.module';
import { FinancialAuthModule } from './financial-auth/financial-auth.module';
import { ReportModule } from './report/report.module';
import { OrderDisputeModule } from './order-dispute/order-dispute.module';
import { ReviewModule } from './review/review.module';
import { PlatformSettingsModule } from './platform-settings/platform-settings.module';
import { RankingModule } from './ranking/ranking.module';
import { FavoriteModule } from './favorite/favorite.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    MailerModule.forRoot({
      transport: {
        host: envs.emailHost,
        port: envs.emailPort,
        secure: envs.emailSecure,
        auth: {
          user: envs.emailUser,
          pass: envs.emailPass,
        },
      },
      defaults: {
        from: envs.emailFrom,
        replyTo: 'no-reply@tulojita.com',
      },
    }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: envs.dbHost,
      port: Number(envs.dbPort),
      database: envs.dbName,
      username: envs.dbUsername,
      password: envs.dbPassword,
      autoLoadEntities: true,
      synchronize: true,
    }),
    AuthModule,
    UserModule,
    AddressModule,
    CompanyModule,
    StoreModule,
    CategoryModule,
    ItemModule,
    StoreCategoryModule,
    SubcategoryModule,
    StoreAddressModule,
    PaymentModule,
    OrderModule,
    OrderItemModule,
    NotificationModule,
    BankModule,
    StorePaymentMethodModule,
    MailModule,
    CommissionModule,
    SubscriptionModule,
    FinancialAuthModule,
    ReportModule,
    OrderDisputeModule,
    ReviewModule,
    PlatformSettingsModule,
    RankingModule,
    FavoriteModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
