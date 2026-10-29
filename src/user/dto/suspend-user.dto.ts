import { IsIn, IsNotEmpty, IsOptional, IsString, IsDateString } from 'class-validator';

export class SuspendUserDto {
  @IsString()
  @IsIn(['TEMPORARY', 'PERMANENT'], {
    message: 'El tipo de suspensión debe ser TEMPORARY o PERMANENT',
  })
  type: 'TEMPORARY' | 'PERMANENT';

  @IsString()
  @IsNotEmpty({ message: 'El motivo de la suspensión es obligatorio' })
  reason: string;

  @IsOptional()
  @IsDateString(
    {},
    { message: 'La fecha de suspensión debe ser un formato de fecha ISO válido' },
  )
  suspendedUntil?: string;
}
