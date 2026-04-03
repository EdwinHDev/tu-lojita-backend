import { IsNotEmpty, IsString, MaxLength, MinLength } from "class-validator";
import { IsRif } from "../decorators/is-rif.decorator";

export class CreateCompanyDto {

  @IsString({ message: 'El nombre debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El nombre no puede estar vacío' })
  @MinLength(1, { message: 'El nombre no puede estar vacío' })
  @MaxLength(100, { message: 'El nombre debe tener menos de 100 caracteres' })
  name: string;

  @IsRif({ message: 'El RIF no es válido' })
  rif: string;

  @IsString({ message: 'El logo debe ser una cadena de texto' })
  @MinLength(1, { message: 'El logo no puede estar vacío' })
  logo: string;

}
