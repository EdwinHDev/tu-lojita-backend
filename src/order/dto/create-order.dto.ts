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
} from 'class-validator';
import { Type } from 'class-transformer';
import { CreateOrderItemDto } from '../../order-item/dto/create-order-item.dto';
import { InstallmentPeriod } from 'src/store/types/installment-period.enum';

export class CreateOrderDto {
  @IsString({ message: 'El ID de la tienda debe ser una cadena de texto' })
  @IsUUID('4', { message: 'El ID de la tienda debe ser un UUID válido' })
  @IsNotEmpty({ message: 'El ID de la tienda es obligatorio' })
  storeId: string;

  @IsBoolean({ message: 'isPartialPayment debe ser un valor booleano' })
  @IsOptional()
  isPartialPayment?: boolean;

  @IsArray({ message: 'Los items deben ser un arreglo' })
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  @IsNotEmpty({ message: 'La orden debe tener al menos un item' })
  items: CreateOrderItemDto[];

  @IsInt({ message: 'El valor del intervalo debe ser un número entero' })
  @IsOptional()
  installmentIntervalValue?: number;

  @IsEnum(InstallmentPeriod, { message: 'La unidad del intervalo no es válida' })
  @IsOptional()
  installmentIntervalUnit?: InstallmentPeriod;
}
