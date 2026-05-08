import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StorePaymentMethod } from './entities/store-payment-method.entity';
import { StorePaymentMethodService } from './store-payment-method.service';
import { StorePaymentMethodController } from './store-payment-method.controller';
import { StoreModule } from 'src/store/store.module';
import { BankModule } from 'src/bank/bank.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([StorePaymentMethod]),
    StoreModule,
    BankModule,
  ],
  controllers: [StorePaymentMethodController],
  providers: [StorePaymentMethodService],
  exports: [StorePaymentMethodService],
})
export class StorePaymentMethodModule {}
