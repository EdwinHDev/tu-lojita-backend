import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StoreAddressService } from './store-address.service';
import { StoreAddressController } from './store-address.controller';
import { StoreAddress } from './entities/store-address.entity';

@Module({
  imports: [TypeOrmModule.forFeature([StoreAddress])],
  controllers: [StoreAddressController],
  providers: [StoreAddressService],
})
export class StoreAddressModule { }
