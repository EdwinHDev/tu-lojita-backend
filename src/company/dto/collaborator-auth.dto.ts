import {
  IsNotEmpty,
  IsString,
  Length,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CollaboratorLoginDto {
  @IsString()
  @IsNotEmpty({ message: 'El ID de acceso es obligatorio' })
  @Length(8, 8, { message: 'El ID de acceso debe tener exactamente 8 dígitos' })
  @Matches(/^\d{8}$/, {
    message: 'El ID de acceso debe ser numérico de 8 dígitos',
  })
  accessId: string;

  @IsString()
  @IsNotEmpty({ message: 'La contraseña es obligatoria' })
  @Length(8, 32, {
    message: 'La contraseña debe tener al menos 8 caracteres',
  })
  password: string;
}

export class ChangeCollaboratorPasswordDto {
  @IsString()
  @IsNotEmpty({ message: 'Debes ingresar tu contraseña actual' })
  currentPassword: string;

  @IsString()
  @IsNotEmpty({ message: 'Debes ingresar la nueva contraseña' })
  @MinLength(8, {
    message: 'La nueva contraseña debe tener al menos 8 caracteres',
  })
  @MaxLength(32, {
    message: 'La nueva contraseña no puede exceder 32 caracteres',
  })
  newPassword: string;
}
