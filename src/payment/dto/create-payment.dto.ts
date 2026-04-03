import { IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, IsUUID, Min } from "class-validator";

export class CreatePaymentDto {

  @IsNumber({}, { message: 'El monto del pago debe ser un número válido' })
  @IsPositive({ message: 'El monto del pago debe ser un número positivo' })
  @Min(0.01, { message: 'El monto mínimo de pago es 0.01' })
  amount: number;

  @IsString({ message: 'La moneda debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'La moneda es obligatoria (ej: USD, VES)' })
  currency: string;

  @IsString({ message: 'El método de pago es obligatorio' })
  @IsNotEmpty({ message: 'El método de pago no puede estar vacío' })
  paymentMethod: string;

  @IsString({ message: 'La referencia debe ser una cadena de texto' })
  @IsOptional()
  reference?: string;

  @IsString({ message: 'La imagen del recibo debe ser una URL o identificador válido' })
  @IsOptional()
  receiptImage?: string;

  @IsUUID('4', { message: 'El ID de la orden debe ser un UUID válido (v4)' })
  @IsNotEmpty({ message: 'El ID de la orden es obligatorio' })
  orderId: string;

  @IsUUID('4', { message: 'El ID de la tienda debe ser un UUID válido (v4)' })
  @IsNotEmpty({ message: 'El ID de la tienda es obligatorio' })
  storeId: string;

  @IsUUID('4', { message: 'El ID del usuario debe ser un UUID válido (v4)' })
  @IsNotEmpty({ message: 'El ID del usuario es obligatorio' })
  userId: string;
}
