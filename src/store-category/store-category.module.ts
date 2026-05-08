import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StoreCategoryService } from './store-category.service';
import { StoreCategoryController } from './store-category.controller';
import { StoreCategory } from './entities/store-category.entity';
import { Store } from 'src/store/entities/store.entity';
import { ItemPropertyTemplate } from 'src/item/entities/item-property-template.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([StoreCategory, Store, ItemPropertyTemplate]),
  ],
  controllers: [StoreCategoryController],
  providers: [StoreCategoryService],
})
export class StoreCategoryModule {}
