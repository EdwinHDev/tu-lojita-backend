import { Module } from '@nestjs/common';
import { StoreService } from './store.service';
import { StoreController } from './store.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Store } from './entities/store.entity';
import { Company } from 'src/company/entities/company.entity';
import { Category } from 'src/category/entities/category.entity';
import { Subcategory } from 'src/subcategory/entities/subcategory.entity';
import { User } from 'src/user/entities/user.entity';
import { StoreAddress } from 'src/store-address/entities/store-address.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Store, Company, Category, Subcategory, User, StoreAddress])],
  controllers: [StoreController],
  providers: [StoreService],
})
export class StoreModule { }
