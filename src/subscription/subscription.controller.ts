import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { Auth } from 'src/auth/decorators/auth.decorator';
import { GetUser } from 'src/auth/decorators/get-user.decorator';
import { UserRole } from 'src/user/types/user-role.enum';
import { User } from 'src/user/entities/user.entity';
import { FinancialAdminGuard } from 'src/financial-auth/guards/financial-admin.guard';
import { CompanySubscriptionService } from './subscription.service';
import { SubscriptionPaymentStatus } from './types';

@Controller('subscriptions')
export class SubscriptionController {
  constructor(
    private readonly subscriptionService: CompanySubscriptionService,
  ) {}

  // ----------------------------------------------------
  // RUTAS PARA EL COMERCIO (TU_LOJITA_BUSINESS)
  // ----------------------------------------------------
  @Auth(UserRole.COMPANY, UserRole.VENDOR, UserRole.ADMIN)
  @Get('my-subscription')
  getMySubscription(@GetUser() user: User) {
    return this.subscriptionService.getSubscriptionForUser(user);
  }

  @Auth(UserRole.COMPANY, UserRole.VENDOR, UserRole.ADMIN)
  @Post('report-payment')
  reportPayment(
    @GetUser() user: User,
    @Body()
    dto: {
      amount: number;
      paymentMethodId: string;
      referenceNumber: string;
      receiptImageUrl: string;
    },
  ) {
    return this.subscriptionService.reportPayment(user, dto);
  }

  // ----------------------------------------------------
  // RUTAS ADMINISTRATIVAS (FINANCIAL OTP GUARD)
  // ----------------------------------------------------
  @Auth(UserRole.ADMIN)
  @UseGuards(FinancialAdminGuard)
  @Get('admin/settings')
  getSettings() {
    return this.subscriptionService.getSettings();
  }

  @Auth(UserRole.ADMIN)
  @UseGuards(FinancialAdminGuard)
  @Patch('admin/settings')
  updateSettings(@Body() dto: any) {
    return this.subscriptionService.updateSettings(dto);
  }

  @Auth(UserRole.ADMIN)
  @UseGuards(FinancialAdminGuard)
  @Get('admin/all')
  getAllSubscriptions() {
    return this.subscriptionService.getAllSubscriptions();
  }

  @Auth(UserRole.ADMIN)
  @UseGuards(FinancialAdminGuard)
  @Get('admin/pending-receipts')
  getPendingReceipts() {
    return this.subscriptionService.getPendingPayments();
  }

  @Auth(UserRole.ADMIN)
  @UseGuards(FinancialAdminGuard)
  @Patch('admin/payments/:id/review')
  reviewPayment(
    @Param('id') id: string,
    @Body()
    action: { status: SubscriptionPaymentStatus; rejectionReason?: string },
    @GetUser() reviewer: User,
  ) {
    return this.subscriptionService.reviewPayment(id, action, reviewer);
  }

  @Auth(UserRole.ADMIN)
  @UseGuards(FinancialAdminGuard)
  @Get('admin/metrics')
  getSubscriptionMetrics() {
    return this.subscriptionService.getSubscriptionMetrics();
  }

  @Auth(UserRole.ADMIN)
  @UseGuards(FinancialAdminGuard)
  @Post('admin/reset-test-data')
  resetTestData() {
    return this.subscriptionService.resetTestData();
  }
}
