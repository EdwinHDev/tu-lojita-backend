import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { IsRif } from '../decorators/is-rif.decorator';

export class CreateCompanyDto {
  @IsString({ message: 'El nombre debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El nombre no puede estar vacío' })
  @MinLength(1, { message: 'El nombre no puede estar vacío' })
  @MaxLength(100, { message: 'El nombre debe tener menos de 100 caracteres' })
  name: string;

  @IsRif({ message: 'El RIF no es válido' })
  rif: string;

  @IsString({ message: 'El logo debe ser una cadena de texto' })
  @MinLength(1, { message: 'El logo no puede estar vacío' })
  logo: string;

  @IsUUID('4', { message: 'El ID de la subcategoría debe ser un UUID válido' })
  @IsOptional()
  subcategoryId?: string;

  @IsString({ message: 'El teléfono debe ser una cadena de texto' })
  @IsOptional()
  @MaxLength(30, { message: 'El teléfono debe tener menos de 30 caracteres' })
  phone?: string;

  @IsString({ message: 'La descripción debe ser una cadena de texto' })
  @IsOptional()
  @MaxLength(500, { message: 'La descripción debe tener menos de 500 caracteres' })
  description?: string;
}
