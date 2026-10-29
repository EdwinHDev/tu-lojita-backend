import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class BlockCustomerDto {
  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsEmail({}, { message: 'El correo electrónico no es válido' })
  email?: string;

  @IsNotEmpty({ message: 'El motivo de la restricción es requerido' })
  @IsString()
  @MaxLength(500)
  reason: string;
}
