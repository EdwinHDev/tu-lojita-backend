import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { AppOrigin } from '../types/app-origin.enum';

export class RequestRegistrationOtpDto {
  @IsEmail({}, { message: 'El correo electrónico no es válido.' })
  @IsNotEmpty({ message: 'El correo electrónico es requerido.' })
  email: string;

  @IsString({ message: 'La contraseña debe ser una cadena de texto.' })
  @MinLength(6, { message: 'La contraseña debe tener al menos 6 caracteres.' })
  @IsNotEmpty({ message: 'La contraseña es requerida.' })
  password: string;

  @IsString({ message: 'El nombre debe ser una cadena de texto.' })
  @IsNotEmpty({ message: 'El nombre es requerido.' })
  firstName: string;

  @IsString({ message: 'El apellido debe ser una cadena de texto.' })
  @IsOptional()
  lastName?: string;

  @IsEnum(AppOrigin, { message: 'El origen de la aplicación no es válido.' })
  @IsNotEmpty({ message: 'El origen de la aplicación es requerido.' })
  appOrigin: AppOrigin;

  @IsString({ message: 'El teléfono debe ser una cadena de texto.' })
  @IsOptional()
  phone?: string;

  @IsString({ message: 'La identificación debe ser una cadena de texto.' })
  @IsOptional()
  identification?: string;

  @IsString({
    message: 'La fecha de nacimiento debe ser una cadena de texto válida.',
  })
  @IsOptional()
  birthDate?: string;
}
