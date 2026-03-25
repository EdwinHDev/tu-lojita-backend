import { IsString, MinLength } from "class-validator";

export class CreateCategoryDto {

  @IsString({ message: 'El nombre debe ser una cadena de texto' })
  @MinLength(1, { message: 'El nombre no puede estar vacío' })
  name: string;

  @IsString({ message: 'La descripción debe ser una cadena de texto' })
  @MinLength(1, { message: 'La descripción no puede estar vacía' })
  description: string;

  @IsString({ message: 'La imagen debe ser una cadena de texto' })
  @MinLength(1, { message: 'La imagen no puede estar vacía' })
  image: string;

}
