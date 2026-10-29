import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentService } from './payment.service';
import { PaymentController } from './payment.controller';
import { Payment } from './entities/payment.entity';
import { Order } from 'src/order/entities/order.entity';
import { Store } from 'src/store/entities/store.entity';
import { User } from 'src/user/entities/user.entity';
import { ItemVariant } from 'src/item/entities/item-variant.entity';
import { NotificationModule } from 'src/notification/notification.module';
import { CommissionModule } from 'src/commission/commission.module';
import { PlatformSettingsModule } from 'src/platform-settings/platform-settings.module';
import { CompanyModule } from 'src/company/company.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Payment, Order, Store, User, ItemVariant]),
    NotificationModule,
    CommissionModule,
    PlatformSettingsModule,
    CompanyModule,
  ],
  controllers: [PaymentController],
  providers: [PaymentService],
  exports: [PaymentService],
})
export class PaymentModule {}
