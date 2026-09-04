import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FinancialOtp } from './entities/financial-otp.entity';
import { FinancialAuthService } from './financial-auth.service';
import { FinancialAuthController } from './financial-auth.controller';
import { FinancialAdminGuard } from './guards/financial-admin.guard';
import { MailModule } from 'src/common/mail/mail.module';
import { AuthModule } from 'src/auth/auth.module';

@Module({
  imports: [TypeOrmModule.forFeature([FinancialOtp]), MailModule, AuthModule],
  controllers: [FinancialAuthController],
  providers: [FinancialAuthService, FinancialAdminGuard],
  exports: [FinancialAuthService, FinancialAdminGuard, TypeOrmModule],
})
export class FinancialAuthModule {}
