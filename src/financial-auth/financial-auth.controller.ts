import {
  Controller,
  Post,
  Get,
  Body,
  Headers,
} from '@nestjs/common';
import { Auth } from 'src/auth/decorators/auth.decorator';
import { GetUser } from 'src/auth/decorators/get-user.decorator';
import { UserRole } from 'src/user/types/user-role.enum';
import { User } from 'src/user/entities/user.entity';
import { FinancialAuthService } from './financial-auth.service';

@Controller('financial-auth')
export class FinancialAuthController {
  constructor(private readonly financialAuthService: FinancialAuthService) {}

  @Auth(UserRole.ADMIN)
  @Post('request-otp')
  requestOtp(@GetUser() user: User) {
    return this.financialAuthService.requestOtp(user);
  }

  @Auth(UserRole.ADMIN)
  @Post('verify-otp')
  verifyOtp(@GetUser() user: User, @Body('code') code: string) {
    return this.financialAuthService.verifyOtp(user, code);
  }

  @Auth(UserRole.ADMIN)
  @Get('verify-status')
  async verifyStatus(@Headers('x-financial-token') token?: string) {
    const isValid = await this.financialAuthService.validateFinancialToken(
      token || '',
    );
    return { isValid };
  }
}
