import { IsEmail, IsEnum, IsOptional, IsString, IsUUID, Matches, MinLength } from "class-validator";
import { UserRole } from "../types";

export class CreateUserDto {

  @IsString({ message: 'El nombre debe de ser una cadena de texto' })
  @MinLength(2, { message: 'El nombre debe tener al menos 2 caracteres' })
  firstName: string;

  @IsString({ message: 'El apellido debe de ser una cadena de texto' })
  @IsOptional()
  @MinLength(2, { message: 'El apellido debe tener al menos 2 caracteres' })
  lastName?: string;

  @MinLength(1, { message: 'El correo es requerido' })
  @IsEmail()
  email: string;

  @IsString()
  @IsOptional()
  avatarUrl?: string;

  @IsString({ message: 'La contraseña debe de ser una cadena de texto' })
  @IsOptional()
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres' })
  @Matches(
    /(?:(?=.*\d)|(?=.*\W+))(?![.\n])(?=.*[A-Z])(?=.*[a-z]).*$/, {
    message: 'La contraseña debe tener una letra mayúscula, una letra minúscula y un número'
  })
  password: string;

  @IsEnum({
    enum: UserRole,
    message: 'El rol no es valido'
  })
  role?: UserRole;

  @IsUUID('4', { message: 'El ID de la empresa debe ser un UUID válido' })
  @IsOptional()
  companyId?: string;

  @IsUUID('4', { message: 'El ID de la tienda debe ser un UUID válido' })
  @IsOptional()
  storeId?: string;

}
