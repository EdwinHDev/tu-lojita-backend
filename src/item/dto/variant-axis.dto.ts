import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class VariantAxisDto {
  @IsString({ message: 'El ID del eje debe ser una cadena de texto' })
  @IsOptional()
  id?: string;

  @IsString({ message: 'El nombre del eje debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El nombre del eje no puede estar vacío' })
  name: string;

  @IsArray({ message: 'Los valores del eje deben ser un array de strings' })
  @IsString({
    each: true,
    message: 'Cada valor del eje debe ser una cadena de texto',
  })
  @IsNotEmpty({ message: 'El eje debe tener al menos un valor' })
  values: string[];

  @IsInt({ message: 'La posición debe ser un número entero' })
  @Min(0, { message: 'La posición no puede ser negativa' })
  @IsOptional()
  position?: number;
}
