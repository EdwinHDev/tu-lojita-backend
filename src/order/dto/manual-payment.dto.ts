import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
} from 'class-validator';

export class ManualPaymentDto {
  @IsNumber({}, { message: 'El monto debe ser un número válido' })
  @IsPositive({ message: 'El monto debe ser positivo' })
  @Min(0.01, { message: 'El monto mínimo es 0.01' })
  amount: number;

  @IsString({ message: 'El método de pago es obligatorio' })
  @IsNotEmpty({ message: 'El método de pago no puede estar vacío' })
  paymentMethod: string;

  @IsString()
  @IsOptional()
  reference?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
