import { IsBoolean, IsNotEmpty, IsNumber, IsOptional, IsString } from "class-validator";

export class CreateAddressDto {
  @IsString({ message: 'El título debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El título es requerido' })
  title: string;

  @IsString({ message: 'La dirección debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'La dirección es requerida' })
  fullAddress: string;

  @IsNumber({}, { message: 'La latitud debe ser un número' })
  @IsNotEmpty({ message: 'La latitud es requerida' })
  latitude: number;

  @IsNumber({}, { message: 'La longitud debe ser un número' })
  @IsNotEmpty({ message: 'La longitud es requerida' })
  longitude: number;

  @IsString({ message: 'La referencia debe ser una cadena de texto' })
  @IsOptional()
  reference?: string;
}
