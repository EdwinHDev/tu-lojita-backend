import {
  IsString,
  IsUUID,
  MinLength,
  IsOptional,
  MaxLength,
  IsNotEmpty,
  ValidateNested,
  IsArray,
  IsNumber,
  IsEnum,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CreateStoreAddressDto } from 'src/store-address/dto/create-store-address.dto';
import { IsRif } from '../decorators/is-rif.decorator';
import { InstallmentPeriod } from '../types/installment-period.enum';

export class InstallmentFrequencyOptionDto {
  @IsNumber()
  value: number;

  @IsEnum(InstallmentPeriod)
  unit: InstallmentPeriod;

  @IsString()
  label: string;
}

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

  @IsString({ message: 'La imagen de portada debe ser una cadena de texto' })
  @IsOptional()
  coverImage?: string;

  @IsUUID('4', { message: 'El ID de la empresa debe ser un UUID válido' })
  @IsOptional()
  companyId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => CreateStoreAddressDto)
  mainAddress?: CreateStoreAddressDto;

  @IsUUID('4', { message: 'El ID de la subcategoría debe ser un UUID válido' })
  subCategoryId: string;

  @IsString({
    message: 'El nombre de la sucursal debe ser una cadena de texto',
  })
  @IsOptional()
  @MaxLength(100, {
    message: 'El nombre de la sucursal debe tener menos de 100 caracteres',
  })
  branchName?: string;

  @IsArray({ message: 'Los métodos de pago deben ser una lista válida' })
  @IsString({
    each: true,
    message: 'Cada método de pago debe ser una cadena de texto',
  })
  @IsOptional()
  paymentMethods?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InstallmentFrequencyOptionDto)
  installmentFrequencyOptions?: InstallmentFrequencyOptionDto[];

  @IsString({ message: 'La zona horaria debe ser una cadena de texto' })
  @IsOptional()
  timezone?: string;
}
