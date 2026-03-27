import { IsNotEmpty, IsString, MaxLength, MinLength } from "class-validator";

export class CreateCategoryDto {

  @IsString({ message: 'El nombre debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El nombre es obligatorio' })
  @MinLength(1, { message: 'El nombre no puede estar vacío' })
  @MaxLength(50, { message: 'El nombre debe tener menos de 50 caracteres' })
  name: string;

  @IsString({ message: 'La descripción debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'La descripción es obligatoria' })
  @MinLength(1, { message: 'La descripción no puede estar vacía' })
  @MaxLength(255, { message: 'La descripción debe tener menos de 255 caracteres' })
  description: string;

  @IsString({ message: 'La imagen debe ser una cadena de texto' })
  @MinLength(1, { message: 'La imagen no puede estar vacía' })
  image: string;

}
