import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CreateOrderDto } from 'src/order/dto/create-order.dto';

export class InitialPaymentPayloadDto {
  @IsNumber({}, { message: 'El monto del pago debe ser un número válido' })
  @Min(0, { message: 'El monto mínimo de pago es 0' })
  amount: number;

  @IsString({ message: 'La moneda debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'La moneda es obligatoria (ej: USD, VES)' })
  currency: string;

  @ValidateIf((o: InitialPaymentPayloadDto) => Number(o.amount) > 0)
  @IsString({ message: 'El método de pago es obligatorio' })
  @IsNotEmpty({ message: 'El método de pago no puede estar vacío' })
  paymentMethod?: string | null;

  @ValidateIf((o: InitialPaymentPayloadDto) => Number(o.amount) > 0)
  @IsString({ message: 'La referencia debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'La referencia de pago es obligatoria' })
  reference?: string | null;

  @IsString({
    message: 'La imagen del recibo debe ser una URL o identificador válido',
  })
  @IsOptional()
  receiptImage?: string | null;

  @IsUUID('4', { message: 'El ID de la orden debe ser un UUID válido (v4)' })
  @IsOptional()
  orderId?: string;

  @IsUUID('4', { message: 'El ID de la tienda debe ser un UUID válido (v4)' })
  @IsNotEmpty({ message: 'El ID de la tienda es obligatorio' })
  storeId: string;
}

export class CreatePaymentWithOrderDto {
  @ValidateNested()
  @Type(() => CreateOrderDto)
  order: CreateOrderDto;

  @ValidateNested()
  @Type(() => InitialPaymentPayloadDto)
  payment: InitialPaymentPayloadDto;
}
