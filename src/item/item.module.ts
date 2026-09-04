import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ItemService } from './item.service';
import { ItemController } from './item.controller';
import { Item } from './entities/item.entity';
import { ItemPropertyTemplate } from './entities/item-property-template.entity';
import { Store } from 'src/store/entities/store.entity';
import { StoreCategory } from 'src/store-category/entities/store-category.entity';
import { StorePaymentMethod } from 'src/store-payment-method/entities/store-payment-method.entity';
import { CustomizationGroup } from './entities/customization-group.entity';
import { CustomizationOption } from './entities/customization-option.entity';
import { ItemAttributeValue } from './entities/item-attribute-value.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Item,
      ItemPropertyTemplate,
      Store,
      StoreCategory,
      StorePaymentMethod,
      CustomizationGroup,
      CustomizationOption,
      ItemAttributeValue,
    ]),
  ],
  controllers: [ItemController],
  providers: [ItemService],
})
export class ItemModule {}
