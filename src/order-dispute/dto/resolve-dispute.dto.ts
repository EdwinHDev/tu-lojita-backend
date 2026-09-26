import { IsEnum, IsNotEmpty, IsString, MinLength } from 'class-validator';
import { DisputeResolution, DisputeStatus } from '../types';

export class ResolveDisputeDto {
  @IsEnum(DisputeResolution, { message: 'El tipo de resolución no es válido.' })
  @IsNotEmpty({ message: 'El tipo de resolución es obligatorio.' })
  resolution: DisputeResolution;

  @IsEnum(DisputeStatus, { message: 'El estado final no es válido.' })
  @IsNotEmpty({ message: 'El estado final es obligatorio.' })
  status: DisputeStatus;

  @IsString({ message: 'La nota del administrador debe ser un texto.' })
  @IsNotEmpty({ message: 'La nota del administrador es obligatoria.' })
  @MinLength(5, { message: 'La nota del administrador debe tener al menos 5 caracteres.' })
  adminNote: string;
}
