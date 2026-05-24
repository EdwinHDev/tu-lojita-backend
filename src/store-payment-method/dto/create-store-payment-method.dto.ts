import { IsEnum, IsString, IsOptional, IsBoolean, IsUUID } from 'class-validator';
import { PaymentMethodType } from '../types';
import { PartialType } from '@nestjs/mapped-types';

export class CreateStorePaymentMethodDto {
  @IsEnum(PaymentMethodType)
  type: PaymentMethodType;

  @IsString()
  title: string;

  @IsString()
  @IsOptional()
  accountHolder?: string;

  @IsString()
  @IsOptional()
  idNumber?: string;

  @IsString()
  @IsOptional()
  accountNumber?: string;

  @IsString()
  @IsOptional()
  phoneNumber?: string;

  @IsString()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  walletAddress?: string;

  @IsString()
  @IsOptional()
  instructions?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsUUID()
  @IsOptional()
  bankId?: string;

  @IsUUID()
  storeId: string;
}

export class UpdateStorePaymentMethodDto extends PartialType(CreateStorePaymentMethodDto) {}
