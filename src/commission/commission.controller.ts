import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { Auth } from 'src/auth/decorators/auth.decorator';
import { GetUser } from 'src/auth/decorators/get-user.decorator';
import { UserRole } from 'src/user/types/user-role.enum';
import { User } from 'src/user/entities/user.entity';
import { FinancialAdminGuard } from 'src/financial-auth/guards/financial-admin.guard';
import { StoreCommissionBillingService } from './commission-billing.service';
import { PaymentReportStatus } from './types';

@Controller('commissions')
export class CommissionController {
  constructor(
    private readonly billingService: StoreCommissionBillingService,
  ) {}

  // ----------------------------------------------------
  // RUTAS PÚBLICAS / COMERCIOS (ACCESO A RANGOS ACTIVOS)
  // ----------------------------------------------------
  @Get('active-ranges')
  getActiveRanges() {
    return this.billingService.getActiveRanges();
  }

  // ----------------------------------------------------
  // RUTAS ADMINISTRATIVAS (PROTEGIDAS CON FINANCIAL OTP)
  // ----------------------------------------------------
  @Auth(UserRole.ADMIN)
  @UseGuards(FinancialAdminGuard)
  @Get('settings')
  getSettingsAndRanges() {
    return this.billingService.getSettingsAndRanges();
  }

  @Auth(UserRole.ADMIN)
  @UseGuards(FinancialAdminGuard)
  @Patch('settings')
  updateSettings(@Body() updateDto: any) {
    return this.billingService.updateSettings(updateDto);
  }

  @Auth(UserRole.ADMIN)
  @UseGuards(FinancialAdminGuard)
  @Post('ranges')
  createRange(@Body() dto: any) {
    return this.billingService.createRange(dto);
  }

  @Auth(UserRole.ADMIN)
  @UseGuards(FinancialAdminGuard)
  @Patch('ranges/:id')
  updateRange(@Param('id') id: string, @Body() dto: any) {
    return this.billingService.updateRange(id, dto);
  }

  @Auth(UserRole.ADMIN)
  @UseGuards(FinancialAdminGuard)
  @Delete('ranges/:id')
  deleteRange(@Param('id') id: string) {
    return this.billingService.deleteRange(id);
  }

  @Auth(UserRole.ADMIN)
  @UseGuards(FinancialAdminGuard)
  @Get('stores')
  getStoresSummary() {
    return this.billingService.getStoresSummary();
  }

  @Auth(UserRole.ADMIN)
  @UseGuards(FinancialAdminGuard)
  @Patch('stores/:id/exempt')
  toggleStoreExemption(
    @Param('id') id: string,
    @Body('isExempt') isExempt: boolean,
  ) {
    return this.billingService.toggleStoreExemption(id, isExempt);
  }

  @Auth(UserRole.ADMIN)
  @UseGuards(FinancialAdminGuard)
  @Patch('stores/:id/suspension')
  setStoreSuspension(
    @Param('id') id: string,
    @Body('suspend') suspend: boolean,
  ) {
    return this.billingService.setStoreSuspension(id, suspend);
  }

  @Auth(UserRole.ADMIN)
  @UseGuards(FinancialAdminGuard)
  @Patch('payment-reports/:id/review')
  reviewPaymentReport(
    @Param('id') id: string,
    @Body() action: { status: PaymentReportStatus; rejectionReason?: string },
    @GetUser() reviewer: User,
  ) {
    return this.billingService.reviewPaymentReport(id, action, reviewer);
  }

  @Auth(UserRole.ADMIN)
  @UseGuards(FinancialAdminGuard)
  @Get('metrics')
  getCommissionMetrics() {
    return this.billingService.getCommissionMetrics();
  }

  // ----------------------------------------------------
  // RUTAS PARA COMERCIOS (TU_LOJITA_BUSINESS)
  // ----------------------------------------------------
  @Auth(UserRole.VENDOR, UserRole.COMPANY, UserRole.ADMIN)
  @Get('stores/:id/debt-hub')
  getStoreDebtHub(@Param('id') storeId: string) {
    return this.billingService.getStoreDebtHub(storeId);
  }

  @Auth(UserRole.VENDOR, UserRole.COMPANY, UserRole.ADMIN)
  @Post('stores/:id/payment-reports')
  reportCommissionPayment(
    @Param('id') storeId: string,
    @Body()
    dto: {
      billingId: string;
      amount: number;
      paymentMethodId: string;
      referenceNumber: string;
      receiptImageUrl: string;
    },
  ) {
    return this.billingService.reportCommissionPayment(
      storeId,
      dto.billingId,
      dto,
    );
  }
}
