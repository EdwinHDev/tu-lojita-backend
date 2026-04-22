import { IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateProfileDto {
  @IsString({ message: 'La identificación debe ser una cadena de texto' })
  @IsOptional()
  @MinLength(6, { message: 'La identificación debe tener al menos 6 caracteres' })
  identification?: string;

  @IsString({ message: 'El teléfono debe ser una cadena de texto' })
  @IsOptional()
  @MinLength(10, { message: 'El teléfono debe tener al menos 10 caracteres' })
  phone?: string;
}
