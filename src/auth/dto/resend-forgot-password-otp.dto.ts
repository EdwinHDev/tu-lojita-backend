import { IsNotEmpty, IsString } from 'class-validator';

export class ResendForgotPasswordOtpDto {
  @IsString({ message: 'El token de recuperación debe ser una cadena de texto.' })
  @IsNotEmpty({ message: 'El token de recuperación es requerido.' })
  recoveryToken: string;
}
