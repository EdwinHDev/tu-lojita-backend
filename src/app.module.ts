import { Module } from '@nestjs/common';
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

@Module({
  imports: [
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
  ],
  controllers: [],
  providers: [],
})
export class AppModule { }
