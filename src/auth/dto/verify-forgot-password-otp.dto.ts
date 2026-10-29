import { IsNotEmpty, IsString, Length } from 'class-validator';

export class VerifyForgotPasswordOtpDto {
  @IsString({ message: 'El token de recuperación debe ser una cadena de texto.' })
  @IsNotEmpty({ message: 'El token de recuperación es requerido.' })
  recoveryToken: string;

  @IsString({ message: 'El código OTP debe ser una cadena de texto.' })
  @Length(6, 6, { message: 'El código OTP debe tener exactamente 6 dígitos.' })
  @IsNotEmpty({ message: 'El código OTP es requerido.' })
  otp: string;
}
