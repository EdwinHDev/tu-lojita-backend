import { IsString, IsUUID, MinLength, IsOptional, MaxLength, IsNotEmpty } from "class-validator";
import { IsRif } from "../decorators/is-rif.decorator";

export class CreateStoreDto {

  @IsString({ message: 'El nombre debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El nombre es obligatorio' })
  @MinLength(1, { message: 'El nombre no puede estar vacío' })
  @MaxLength(100, { message: 'El nombre debe tener menos de 100 caracteres' })
  name: string;

  @IsString({ message: 'La descripción debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'La descripción es obligatoria' })
  @MinLength(3, { message: 'La descripción debe tener al menos 3 caracteres' })
  @MaxLength(500, { message: 'La descripción debe tener menos de 500 caracteres' })
  description: string;

  @IsString({ message: 'El RIF debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El RIF es obligatorio' })
  @MinLength(1, { message: 'El RIF no puede estar vacío' })
  @MaxLength(20, { message: 'El RIF debe tener menos de 20 caracteres' })
  @IsRif({ message: 'El RIF proporcionado es inválido' })
  rif: string;

  @IsString({ message: 'El teléfono debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El teléfono es obligatorio' })
  @MinLength(1, { message: 'El teléfono no puede estar vacío' })
  @MaxLength(20, { message: 'El teléfono debe tener menos de 20 caracteres' })
  phone: string;

  @IsString({ message: 'La dirección debe ser una cadena de texto' })
  @IsOptional()
  @MaxLength(255, { message: 'La dirección debe tener menos de 255 caracteres' })
  address?: string;

  @IsString({ message: 'La ciudad debe ser una cadena de texto' })
  @IsOptional()
  @MaxLength(100, { message: 'La ciudad debe tener menos de 100 caracteres' })
  city?: string;

  @IsString({ message: 'El estado debe ser una cadena de texto' })
  @IsOptional()
  @MaxLength(100, { message: 'El estado debe tener menos de 100 caracteres' })
  state?: string;

  @IsString({ message: 'El logo debe ser una cadena de texto' })
  @MinLength(1, { message: 'El logo no puede estar vacío' })
  logo: string;

  @IsUUID('4', { message: 'El ID de la empresa debe ser un UUID válido' })
  @IsOptional()
  companyId?: string;

  @IsUUID('4', { message: 'El ID de la subcategoría debe ser un UUID válido' })
  subCategoryId: string;

}
