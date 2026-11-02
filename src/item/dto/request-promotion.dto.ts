import {
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
} from 'class-validator';

export class RequestPromotionDto {
  @IsInt({ message: 'durationDays debe ser un número entero' })
  @Min(1, { message: 'durationDays debe ser al menos 1 día' })
  durationDays: number;

  @IsNumber({}, { message: 'amountPaid debe ser un número' })
  @IsPositive({ message: 'amountPaid debe ser positivo' })
  amountPaid: number;

  @IsString({ message: 'paymentReference debe ser un texto' })
  @IsNotEmpty({ message: 'La referencia de pago es obligatoria' })
  paymentReference: string;

  @IsString({ message: 'paymentProofUrl debe ser una URL válida' })
  @IsNotEmpty({ message: 'El comprobante de pago es obligatorio' })
  paymentProofUrl: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

