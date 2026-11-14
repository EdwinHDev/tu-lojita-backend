import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CompanyService } from './company.service';
import { CompanyController } from './company.controller';
import { CompanyDashboardController } from './company-dashboard.controller';
import { CompanyDashboardService } from './company-dashboard.service';
import { CompanyRoleController } from './controllers/company-role.controller';
import { CompanyRoleService } from './services/company-role.service';
import { CompanyCollaboratorController } from './controllers/company-collaborator.controller';
import { CompanyCollaboratorService } from './services/company-collaborator.service';
import { CollaboratorCredentialService } from './services/collaborator-credential.service';
import { CompanyActivityLogController } from './controllers/company-activity-log.controller';
import { CompanyActivityLogService } from './services/company-activity-log.service';
import {
  CompanyCrmController,
  CrmOfferPublicController,
} from './controllers/company-crm.controller';
import { CompanyCrmService } from './services/company-crm.service';
import { Company } from './entities/company.entity';
import { CompanyRole } from './entities/company-role.entity';
import { CompanyRolePermission } from './entities/company-role-permission.entity';
import { CompanyCollaborator } from './entities/company-collaborator.entity';
import { CompanyActivityLog } from './entities/company-activity-log.entity';
import { CompanyCustomerProfile } from './entities/company-customer-profile.entity';
import { CompanyCustomerNote } from './entities/company-customer-note.entity';
import { CrmTargetedOffer } from './entities/crm-targeted-offer.entity';
import { User } from 'src/user/entities/user.entity';
import { Address } from 'src/address/entities/address.entity';
import { Store } from 'src/store/entities/store.entity';
import { Order } from 'src/order/entities/order.entity';
import { Installment } from 'src/order/entities/installment.entity';
import { OrderSlotBooking } from 'src/order/entities/order-slot-booking.entity';
import { Item } from 'src/item/entities/item.entity';
import { ItemFavorite } from 'src/favorite/entities/item-favorite.entity';
import { Payment } from 'src/payment/entities/payment.entity';
import { OrderItem } from 'src/order-item/entities/order-item.entity';
import { Subcategory } from 'src/subcategory/entities/subcategory.entity';
import { StoreAiSettings } from 'src/store-ai/entities/store-ai-settings.entity';
import { StoreCommissionBilling } from 'src/commission/entities/store-commission-billing.entity';
import { CommissionPaymentReport } from 'src/commission/entities/commission-payment-report.entity';
import { PlatformPaymentMethod } from 'src/commission/entities/platform-payment-method.entity';
import { ItemPromotion } from 'src/item/entities/item-promotion.entity';
import { StoreRanking } from 'src/ranking/entities/store-ranking.entity';
import { OrderDispute } from 'src/order-dispute/entities/order-dispute.entity';
import { BuyerReview } from 'src/review/entities/buyer-review.entity';
import { OrderReview } from 'src/review/entities/order-review.entity';
import { StoreCustomerBlock } from 'src/store/entities/store-customer-block.entity';
import { FinancialAuthModule } from 'src/financial-auth/financial-auth.module';
import { NotificationModule } from 'src/notification/notification.module';
import { PlatformSettingsModule } from 'src/platform-settings/platform-settings.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Company,
      CompanyRole,
      CompanyRolePermission,
      CompanyCollaborator,
      CompanyActivityLog,
      CompanyCustomerProfile,
      CompanyCustomerNote,
      CrmTargetedOffer,
      User,
      Address,
      Store,
      StoreAiSettings,
      Order,
      Installment,
      OrderSlotBooking,
      Item,
      ItemFavorite,
      Payment,
      OrderItem,
      Subcategory,
      StoreCommissionBilling,
      CommissionPaymentReport,
      PlatformPaymentMethod,
      ItemPromotion,
      StoreRanking,
      OrderDispute,
      BuyerReview,
      OrderReview,
      StoreCustomerBlock,
    ]),
    FinancialAuthModule,
    NotificationModule,
    PlatformSettingsModule,
  ],
  controllers: [
    CompanyController,
    CompanyDashboardController,
    CompanyRoleController,
    CompanyCollaboratorController,
    CompanyActivityLogController,
    CompanyCrmController,
    CrmOfferPublicController,
  ],
  providers: [
    CompanyService,
    CompanyDashboardService,
    CompanyRoleService,
    CompanyCollaboratorService,
    CollaboratorCredentialService,
    CompanyActivityLogService,
    CompanyCrmService,
  ],
  exports: [
    CompanyService,
    CompanyRoleService,
    CompanyCollaboratorService,
    CollaboratorCredentialService,
    CompanyActivityLogService,
    CompanyCrmService,
  ],
})
export class CompanyModule {}
