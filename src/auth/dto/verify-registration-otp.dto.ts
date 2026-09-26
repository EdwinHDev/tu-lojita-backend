import { IsNotEmpty, IsString, Length } from 'class-validator';

export class VerifyRegistrationOtpDto {
  @IsString({ message: 'El token de registro debe ser una cadena de texto.' })
  @IsNotEmpty({ message: 'El token de registro es requerido.' })
  registrationToken: string;

  @IsString({ message: 'El código de verificación debe ser una cadena de texto.' })
  @Length(6, 6, { message: 'El código de verificación debe contener exactamente 6 dígitos.' })
  @IsNotEmpty({ message: 'El código de verificación es requerido.' })
  otp: string;
}
