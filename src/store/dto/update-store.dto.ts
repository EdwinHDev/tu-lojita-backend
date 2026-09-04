import { PartialType } from '@nestjs/mapped-types';
import { CreateStoreDto } from './create-store.dto';
import {
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsEnum,
  Max,
  Min,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { InstallmentPeriod } from '../types/installment-period.enum';

export class InstallmentFrequencyOptionDto {
  @IsNumber()
  value: number;

  @IsEnum(InstallmentPeriod)
  unit: InstallmentPeriod;

  @IsString()
  label: string;
}

export class UpdateStoreDto extends PartialType(CreateStoreDto) {
  @IsBoolean({ message: 'El campo allowPartialPayments debe ser un booleano' })
  @IsOptional()
  allowPartialPayments?: boolean;

  @IsNumber({}, { message: 'El porcentaje de recargo debe ser un número' })
  @Min(0, { message: 'El porcentaje mínimo es 0' })
  @Max(100, { message: 'El porcentaje máximo es 100' })
  @IsOptional()
  partialPaymentsFeePercentage?: number;

  @IsNumber({}, { message: 'El porcentaje mínimo debe ser un número' })
  @Min(0, { message: 'El porcentaje mínimo es 0' })
  @Max(100, { message: 'El porcentaje máximo es 100' })
  @IsOptional()
  minInitialPaymentPercentage?: number;

  @IsNumber({}, { message: 'El número de cuotas debe ser un número entero' })
  @Min(0, { message: 'El número mínimo de cuotas es 0' })
  @IsOptional()
  maxInstallments?: number;

  @IsBoolean({ message: 'El campo allowChat debe ser un booleano' })
  @IsOptional()
  allowChat?: boolean;

  @IsString({ message: 'El nombre de la sucursal debe ser un texto' })
  @IsNotEmpty({ message: 'El nombre de la sucursal no puede estar vacío' })
  @IsOptional()
  branchName?: string;

  @IsNumber({}, { message: 'El valor del intervalo debe ser un número' })
  @IsOptional()
  installmentIntervalValue?: number;

  @IsEnum(InstallmentPeriod, {
    message: 'El periodo de cuotas debe ser DAYS, WEEKS o MONTHS',
  })
  @IsOptional()
  installmentIntervalUnit?: InstallmentPeriod;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InstallmentFrequencyOptionDto)
  installmentFrequencyOptions?: InstallmentFrequencyOptionDto[];

  @IsBoolean({
    message: 'El campo allowInstallmentExtensions debe ser un booleano',
  })
  @IsOptional()
  allowInstallmentExtensions?: boolean;

  @IsNumber({}, { message: 'Los días máximos de prórroga deben ser un número' })
  @Min(1, { message: 'Los días máximos mínimos son 1' })
  @IsOptional()
  maxExtensionDays?: number;

  @IsNumber({}, { message: 'El límite de crédito debe ser un número' })
  @Min(0, { message: 'El límite de crédito mínimo es 0' })
  @IsOptional()
  maxCreditLimit?: number;

  @IsString({ message: 'La zona horaria debe ser una cadena de texto' })
  @IsOptional()
  timezone?: string;
}
