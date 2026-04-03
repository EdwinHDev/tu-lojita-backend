import { IsArray, IsBoolean, IsNotEmpty, IsOptional, IsString, IsUUID, ValidateNested } from "class-validator";
import { Type } from "class-transformer";
import { CreateOrderItemDto } from "../../order-item/dto/create-order-item.dto";

export class CreateOrderDto {

  @IsString({ message: 'El ID de la tienda debe ser una cadena de texto' })
  @IsUUID('4', { message: 'El ID de la tienda debe ser un UUID válido' })
  @IsNotEmpty({ message: 'El ID de la tienda es obligatorio' })
  storeId: string;

  @IsUUID('4', { message: 'El ID del usuario debe ser un UUID válido' })
  @IsNotEmpty({ message: 'El ID del usuario es obligatorio' })
  userId: string;

  @IsBoolean({ message: 'isPartialPayment debe ser un valor booleano' })
  @IsOptional()
  isPartialPayment?: boolean;

  @IsArray({ message: 'Los items deben ser un arreglo' })
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  @IsNotEmpty({ message: 'La orden debe tener al menos un item' })
  items: CreateOrderItemDto[];

}
