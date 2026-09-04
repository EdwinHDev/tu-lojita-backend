import {
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
  IsInt,
  IsEnum,
  IsNumber,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { InstallmentPeriod } from 'src/store/types/installment-period.enum';

export class ValidateCartItemDto {
  @IsUUID('4', { message: 'El ID del item debe ser un UUID válido (v4)' })
  @IsNotEmpty({ message: 'El ID del item es obligatorio' })
  itemId: string;

  @IsNumber({}, { message: 'La cantidad debe ser un número válido' })
  @Min(1, { message: 'La cantidad mínima por item es 1' })
  quantity: number;

  @IsNumber({}, { message: 'El precio debe ser un número válido' })
  @IsOptional()
  priceAtCart?: number;

  @IsOptional()
  selectedOptions?: Record<string, string[]>;
}

export class ValidateCartDto {
  @IsString({ message: 'El ID de la tienda debe ser una cadena de texto' })
  @IsUUID('4', { message: 'El ID de la tienda debe ser un UUID válido' })
  @IsNotEmpty({ message: 'El ID de la tienda es obligatorio' })
  storeId: string;

  @IsBoolean({ message: 'isPartialPayment debe ser un valor booleano' })
  @IsOptional()
  isPartialPayment?: boolean;

  @IsArray({ message: 'Los items deben ser un arreglo' })
  @ValidateNested({ each: true })
  @Type(() => ValidateCartItemDto)
  @IsNotEmpty({ message: 'El carrito debe tener al menos un item' })
  items: ValidateCartItemDto[];

  @IsInt({ message: 'El valor del intervalo debe ser un número entero' })
  @IsOptional()
  installmentIntervalValue?: number;

  @IsEnum(InstallmentPeriod, {
    message: 'La unidad del intervalo no es válida',
  })
  @IsOptional()
  installmentIntervalUnit?: InstallmentPeriod;
}
