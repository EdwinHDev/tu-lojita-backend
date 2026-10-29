import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class ResetForgotPasswordDto {
  @IsString({ message: 'El token de sesión debe ser una cadena de texto.' })
  @IsNotEmpty({ message: 'El token de sesión es requerido.' })
  resetSessionToken: string;

  @IsString({ message: 'La nueva contraseña debe ser una cadena de texto.' })
  @MinLength(6, { message: 'La nueva contraseña debe tener al menos 6 caracteres.' })
  @IsNotEmpty({ message: 'La nueva contraseña es requerida.' })
  newPassword: string;
}
