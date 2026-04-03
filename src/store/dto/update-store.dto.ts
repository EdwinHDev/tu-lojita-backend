import { PartialType } from '@nestjs/mapped-types';
import { CreateStoreDto } from './create-store.dto';
import { IsBoolean, IsNotEmpty, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

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
}
