import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ItemService } from './item.service';
import { ItemController } from './item.controller';
import { Item } from './entities/item.entity';
import { ItemPropertyTemplate } from './entities/item-property-template.entity';
import { Store } from '../store/entities/store.entity';
import { StoreCategory } from '../store-category/entities/store-category.entity';
import { StorePaymentMethod } from '../store-payment-method/entities/store-payment-method.entity';
import { CustomizationGroup } from './entities/customization-group.entity';
import { CustomizationOption } from './entities/customization-option.entity';
import { ItemAttributeValue } from './entities/item-attribute-value.entity';
import { VariantAxis } from './entities/variant-axis.entity';
import { ItemVariant } from './entities/item-variant.entity';
import { OrderItem } from '../order-item/entities/order-item.entity';
import { ItemSlotConfig } from './entities/item-slot-config.entity';
import { ItemTimeSlot } from './entities/item-time-slot.entity';
import { ItemPreorderConfig } from './entities/item-preorder-config.entity';
import { OrderSlotBooking } from '../order/entities/order-slot-booking.entity';
import { Order } from '../order/entities/order.entity';
import { BookingService } from './booking.service';
import { ReleaseExpiredBookingHoldsCron } from './cron/release-expired-booking-holds.cron';
import { NotificationModule } from '../notification/notification.module';
import { CompanyModule } from '../company/company.module';

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
      VariantAxis,
      ItemVariant,
      OrderItem,
      ItemSlotConfig,
      ItemTimeSlot,
      ItemPreorderConfig,
      OrderSlotBooking,
      Order,
    ]),
    NotificationModule,
    CompanyModule,
  ],
  controllers: [ItemController],
  providers: [ItemService, BookingService, ReleaseExpiredBookingHoldsCron],
  exports: [ItemService, BookingService],
})
export class ItemModule {}
