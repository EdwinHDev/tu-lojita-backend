import { IsEmail, IsEnum, IsNotEmpty, IsOptional } from 'class-validator';
import { AppOrigin } from '../types/app-origin.enum';

export class RequestForgotPasswordOtpDto {
  @IsEmail({}, { message: 'El correo electrónico no es válido.' })
  @IsNotEmpty({ message: 'El correo electrónico es requerido.' })
  email: string;

  @IsEnum(AppOrigin, { message: 'El origen de la aplicación no es válido.' })
  @IsOptional()
  appOrigin?: AppOrigin;
}
