import {
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateCompanyCollaboratorDto {
  @IsString()
  @IsOptional()
  @MinLength(2, { message: 'El nombre debe tener al menos 2 caracteres' })
  @MaxLength(60, { message: 'El nombre no puede exceder 60 caracteres' })
  firstName?: string;

  @IsString()
  @IsOptional()
  @MinLength(2, { message: 'El apellido debe tener al menos 2 caracteres' })
  @MaxLength(60, { message: 'El apellido no puede exceder 60 caracteres' })
  lastName?: string;

  @IsString()
  @IsOptional()
  @MaxLength(30, { message: 'La cédula no puede exceder 30 caracteres' })
  identification?: string;

  @IsString()
  @IsOptional()
  @MaxLength(30, { message: 'El teléfono no puede exceder 30 caracteres' })
  phone?: string;

  @IsUUID('4', { message: 'El ID del rol debe ser un UUID válido' })
  @IsOptional()
  roleId?: string;

  @IsArray({ message: 'Las sucursales deben enviarse como una lista' })
  @IsUUID('4', { each: true, message: 'Cada sucursal debe ser un UUID válido' })
  @IsOptional()
  storeIds?: string[];

  @IsBoolean({ message: 'hasFullBranchAccess debe ser un booleano' })
  @IsOptional()
  hasFullBranchAccess?: boolean;

  @IsBoolean({ message: 'isActive debe ser un booleano' })
  @IsOptional()
  isActive?: boolean;
}
