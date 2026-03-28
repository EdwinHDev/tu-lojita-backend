import { IsNotEmpty, IsString, IsUUID } from "class-validator";

export class CreateSubcategoryDto {
  @IsString({ message: 'El nombre debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El nombre es requerido' })
  name: string;

  @IsString({ message: 'La descripción debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'La descripción es requerida' })
  description: string;

  @IsString({ message: 'La URL de la imagen debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'La URL de la imagen es requerida' })
  imageUrl: string;

  @IsUUID('4', { message: 'El ID de la categoría debe ser un UUID válido' })
  @IsNotEmpty({ message: 'El ID de la categoría es requerido' })
  categoryId: string;
}
