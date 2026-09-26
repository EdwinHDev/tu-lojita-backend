import { IsNotEmpty, IsString } from 'class-validator';

export class ResendRegistrationOtpDto {
  @IsString({ message: 'El token de registro debe ser una cadena de texto.' })
  @IsNotEmpty({ message: 'El token de registro es requerido.' })
  registrationToken: string;
}
