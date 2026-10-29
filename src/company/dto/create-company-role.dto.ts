import {
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { CompanyPermission } from '../types/company-permission.enum';

export class CreateCompanyRoleDto {
  @IsString()
  @IsNotEmpty({ message: 'El nombre del rol es obligatorio' })
  @MinLength(2, { message: 'El nombre debe tener al menos 2 caracteres' })
  @MaxLength(50, { message: 'El nombre no puede exceder 50 caracteres' })
  name: string;

  @IsString()
  @IsOptional()
  @MaxLength(255, { message: 'La descripción no puede exceder 255 caracteres' })
  description?: string;

  @IsArray({ message: 'Los permisos deben enviarse como una lista' })
  @IsEnum(CompanyPermission, {
    each: true,
    message: 'Uno o más permisos enviados no son válidos',
  })
  permissions: CompanyPermission[];
}
