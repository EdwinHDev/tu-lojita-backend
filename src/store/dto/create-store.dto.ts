import { IsString, IsUUID, MinLength, IsOptional, MaxLength } from "class-validator";
import { IsRif } from "../decorators/is-rif.decorator";

export class CreateStoreDto {

  @IsString({ message: 'El nombre debe ser una cadena de texto' })
  @MinLength(1, { message: 'El nombre no puede estar vacío' })
  name: string;

  @IsString({ message: 'La descripción debe ser una cadena de texto' })
  @MinLength(20, { message: 'La descripción debe tener al menos 20 caracteres' })
  @MaxLength(150, { message: 'La descripción debe tener menos de 150 caracteres' })
  description: string;

  @IsString({ message: 'El RIF debe ser una cadena de texto' })
  @MinLength(1, { message: 'El RIF no puede estar vacío' })
  @IsRif({ message: 'El RIF proporcionado es inválido' })
  rif: string;

  @IsString({ message: 'El teléfono debe ser una cadena de texto' })
  @MinLength(1, { message: 'El teléfono no puede estar vacío' })
  phone: string;

  @IsString({ message: 'La dirección debe ser una cadena de texto' })
  @IsOptional()
  address?: string;

  @IsString({ message: 'La ciudad debe ser una cadena de texto' })
  @IsOptional()
  city?: string;

  @IsString({ message: 'El estado debe ser una cadena de texto' })
  @IsOptional()
  state?: string;

  @IsString({ message: 'El logo debe ser una cadena de texto' })
  @MinLength(1, { message: 'El logo no puede estar vacío' })
  logo: string;

  @IsUUID('4', { message: 'El ID de la empresa debe ser un UUID válido' })
  @IsOptional()
  companyId?: string;

  @IsUUID('4', { message: 'El ID de la categoría debe ser un UUID válido' })
  categoryId: string;

}
