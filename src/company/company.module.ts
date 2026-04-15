import { Module } from '@nestjs/common';
import { CompanyService } from './company.service';
import { CompanyController } from './company.controller';
import { CompanyDashboardController } from './company-dashboard.controller';
import { CompanyDashboardService } from './company-dashboard.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Company } from './entities/company.entity';
import { User } from 'src/user/entities/user.entity';
import { Store } from 'src/store/entities/store.entity';
import { Order } from 'src/order/entities/order.entity';
import { Item } from 'src/item/entities/item.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Company, User, Store, Order, Item])],
  controllers: [CompanyController, CompanyDashboardController],
  providers: [CompanyService, CompanyDashboardService],
})
export class CompanyModule { }
