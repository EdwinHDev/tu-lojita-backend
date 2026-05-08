import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Bank } from './entities/bank.entity';
import { BankService } from './bank.service';
import { BankController } from './bank.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Bank])],
  controllers: [BankController],
  providers: [BankService],
  exports: [BankService, TypeOrmModule],
})
export class BankModule {}
