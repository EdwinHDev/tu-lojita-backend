import { IsNotEmpty, IsString, MinLength, IsUUID } from "class-validator";

export class CreateStoreCategoryDto {
  @IsString({ message: 'El nombre debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El nombre no puede estar vacío' })
  @MinLength(3, { message: 'El nombre debe tener al menos 3 caracteres' })
  name: string;

  @IsString({ message: 'La descripción debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'La descripción no puede estar vacía' })
  @MinLength(10, { message: 'La descripción debe tener al menos 10 caracteres' })
  description: string;

  @IsString({ message: 'El ID de la tienda debe ser una cadena de texto' })
  @IsUUID('4', { message: 'El ID de la tienda debe ser un UUID válido' })
  storeId: string;
}
