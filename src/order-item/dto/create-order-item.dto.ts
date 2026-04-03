import { IsNotEmpty, IsNumber, IsUUID, Min } from "class-validator";

export class CreateOrderItemDto {
  @IsUUID('4', { message: 'El ID del item debe ser un UUID válido (v4)' })
  @IsNotEmpty({ message: 'El ID del item es obligatorio' })
  itemId: string;

  @IsNumber({}, { message: 'La cantidad debe ser un número válido' })
  @Min(1, { message: 'La cantidad mínima por item es 1' })
  quantity: number;
}
