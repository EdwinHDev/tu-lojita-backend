import { IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { AppOrigin } from '../types/app-origin.enum';

export class AuthGoogleLoginDto {
  @IsString({ message: 'El token debe ser una cadena de texto válida' })
  @IsNotEmpty({ message: 'El token de Google es obligatorio' })
  token: string;

  @IsEnum(AppOrigin, { message: 'El origen de la aplicación no es válido' })
  @IsNotEmpty({ message: 'El origen de la aplicación es obligatorio' })
  appOrigin: AppOrigin;
}
