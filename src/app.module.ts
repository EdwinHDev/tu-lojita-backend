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
    CategoryModule
  ],
  controllers: [],
  providers: [],
})
export class AppModule { }
