import { IsEnum, IsOptional, IsString } from 'class-validator';
import { PaymentStatus } from '../types';

export class VerifyPaymentDto {
  @IsEnum(PaymentStatus)
  status: PaymentStatus;

  @IsOptional()
  @IsString()
  rejectionReason?: string;
}
