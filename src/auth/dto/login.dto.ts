import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsString,
  MinLength,
} from 'class-validator';
import { AppOrigin } from '../types/app-origin.enum';

export class LoginDto {
  @IsEmail({}, { message: 'El correo electrónico no es válido.' })
  @IsNotEmpty({ message: 'El correo electrónico es obligatorio.' })
  email: string;

  @IsString({ message: 'La contraseña debe ser una cadena de texto.' })
  @IsNotEmpty({ message: 'La contraseña es obligatoria.' })
  @MinLength(6, { message: 'La contraseña debe tener al menos 6 caracteres.' })
  password: string;

  @IsEnum(AppOrigin, { message: 'El origen de la aplicación no es válido.' })
  @IsNotEmpty({ message: 'El origen de la aplicación es obligatorio.' })
  appOrigin: AppOrigin;
}
