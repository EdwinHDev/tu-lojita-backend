import { IsString, IsUUID, MinLength, IsOptional, MaxLength, IsNotEmpty, ValidateNested } from "class-validator";
import { Type } from "class-transformer";
import { CreateStoreAddressDto } from "src/store-address/dto/create-store-address.dto";
import { IsRif } from "../decorators/is-rif.decorator";

export class CreateStoreDto {

  @IsString({ message: 'El nombre debe ser una cadena de texto' })
  @MinLength(1, { message: 'El nombre no puede estar vacío' })
  name: string;

  @IsString({ message: 'La descripción debe ser una cadena de texto' })
  @MinLength(1, { message: 'La descripción no puede estar vacía' })
  description: string;

  @IsRif({ message: 'El RIF no es válido' })
  rif: string;

  @IsString({ message: 'El teléfono debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El teléfono es requerido' })
  @MaxLength(20, { message: 'El teléfono debe tener menos de 20 caracteres' })
  phone: string;

  @IsString({ message: 'El logo debe ser una cadena de texto' })
  @MinLength(1, { message: 'El logo no puede estar vacío' })
  logo: string;

  @IsUUID('4', { message: 'El ID de la empresa debe ser un UUID válido' })
  @IsOptional()
  companyId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => CreateStoreAddressDto)
  mainAddress?: CreateStoreAddressDto;

  @IsUUID('4', { message: 'El ID de la subcategoría debe ser un UUID válido' })
  subCategoryId: string;

}
