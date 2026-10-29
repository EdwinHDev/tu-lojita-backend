import { IsNotEmpty, IsNumber, IsOptional, IsUUID, Min } from 'class-validator';

export class CreateOrderItemDto {
  @IsUUID('4', { message: 'El ID del item debe ser un UUID válido (v4)' })
  @IsNotEmpty({ message: 'El ID del item es obligatorio' })
  itemId: string;

  @IsNumber({}, { message: 'La cantidad debe ser un número válido' })
  @Min(1, { message: 'La cantidad mínima por item es 1' })
  quantity: number;

  @IsOptional()
  selectedOptions?: Record<string, string[]>;

  @IsUUID('4', { message: 'El ID de la variante debe ser un UUID válido (v4)' })
  @IsOptional()
  variantId?: string;

  @IsUUID('4', { message: 'El ID del turno debe ser un UUID válido (v4)' })
  @IsOptional()
  timeSlotId?: string;

  @IsOptional()
  bookingDate?: string;
}
