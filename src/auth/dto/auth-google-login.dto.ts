import { IsNotEmpty, IsString } from "class-validator";

export class AuthGoogleLoginDto {

  @IsString({ message: 'El token debe ser una cadena de texto válida' })
  @IsNotEmpty({ message: 'El token de Google es obligatorio' })
  token: string;

}
