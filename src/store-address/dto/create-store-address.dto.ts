import { IsNotEmpty, IsNumber, IsOptional, IsString, Max, Min } from "class-validator";

export class CreateStoreAddressDto {
  @IsString({ message: 'La dirección debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'La dirección es requerida' })
  address: string;

  @IsString({ message: 'La ciudad debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'La ciudad es requerida' })
  city: string;

  @IsString({ message: 'El estado debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El estado es requerido' })
  state: string;

  @IsNumber({}, { message: 'La latitud debe ser un número' })
  @Min(-90)
  @Max(90)
  @IsNotEmpty({ message: 'La latitud es requerida para el cálculo de distancia' })
  latitude: number;

  @IsNumber({}, { message: 'La longitud debe ser un número' })
  @Min(-180)
  @Max(180)
  @IsNotEmpty({ message: 'La longitud es requerida para el cálculo de distancia' })
  longitude: number;
}
