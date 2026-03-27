import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ItemService } from './item.service';
import { ItemController } from './item.controller';
import { Item } from './entities/item.entity';
import { Store } from 'src/store/entities/store.entity';
import { StoreCategory } from 'src/store-category/entities/store-category.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Item, Store, StoreCategory])],
  controllers: [ItemController],
  providers: [ItemService],
})
export class ItemModule {}
