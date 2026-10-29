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
import { Company } from './entities/company.entity';
import { CompanyRole } from './entities/company-role.entity';
import { CompanyRolePermission } from './entities/company-role-permission.entity';
import { CompanyCollaborator } from './entities/company-collaborator.entity';
import { CompanyActivityLog } from './entities/company-activity-log.entity';
import { User } from 'src/user/entities/user.entity';
import { Store } from 'src/store/entities/store.entity';
import { Order } from 'src/order/entities/order.entity';
import { Item } from 'src/item/entities/item.entity';
import { Payment } from 'src/payment/entities/payment.entity';
import { OrderItem } from 'src/order-item/entities/order-item.entity';
import { Subcategory } from 'src/subcategory/entities/subcategory.entity';
import { FinancialAuthModule } from 'src/financial-auth/financial-auth.module';
import { NotificationModule } from 'src/notification/notification.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Company,
      CompanyRole,
      CompanyRolePermission,
      CompanyCollaborator,
      CompanyActivityLog,
      User,
      Store,
      Order,
      Item,
      Payment,
      OrderItem,
      Subcategory,
    ]),
    FinancialAuthModule,
    NotificationModule,
  ],
  controllers: [
    CompanyController,
    CompanyDashboardController,
    CompanyRoleController,
    CompanyCollaboratorController,
    CompanyActivityLogController,
  ],
  providers: [
    CompanyService,
    CompanyDashboardService,
    CompanyRoleService,
    CompanyCollaboratorService,
    CollaboratorCredentialService,
    CompanyActivityLogService,
  ],
  exports: [
    CompanyService,
    CompanyRoleService,
    CompanyCollaboratorService,
    CollaboratorCredentialService,
    CompanyActivityLogService,
  ],
})
export class CompanyModule {}
