import { IsString, MinLength } from "class-validator";

export class CreateCompanyDto {

  @IsString({ message: 'El nombre debe ser una cadena de texto' })
  @MinLength(1, { message: 'El nombre no puede estar vacío' })
  name: string;

  @IsString({ message: 'El logo debe ser una cadena de texto' })
  @MinLength(1, { message: 'El logo no puede estar vacío' })
  logo: string;

}
