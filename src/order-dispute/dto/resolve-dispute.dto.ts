import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import {
  DisputePenaltyType,
  DisputeResolution,
  DisputeStatus,
  DisputeVerdict,
} from '../types';

export class ResolveDisputeDto {
  @IsEnum(DisputeResolution, { message: 'El tipo de resolución no es válido.' })
  @IsOptional()
  resolution?: DisputeResolution;

  @IsEnum(DisputeStatus, { message: 'El estado final no es válido.' })
  @IsOptional()
  status?: DisputeStatus;

  @IsEnum(DisputeVerdict, { message: 'El dictamen arbitral no es válido.' })
  @IsOptional()
  verdict?: DisputeVerdict;

  @IsEnum(DisputePenaltyType, {
    message: 'La sanción al comprador no es válida.',
  })
  @IsOptional()
  buyerPenalty?: DisputePenaltyType = DisputePenaltyType.NONE;

  @IsEnum(DisputePenaltyType, {
    message: 'La sanción al comercio no es válida.',
  })
  @IsOptional()
  merchantPenalty?: DisputePenaltyType = DisputePenaltyType.NONE;

  @IsString({
    message: 'La justificación del equipo de soporte debe ser un texto.',
  })
  @IsNotEmpty({ message: 'La justificación del equipo de soporte es obligatoria.' })
  @MinLength(5, {
    message:
      'La justificación del equipo de soporte debe tener al menos 5 caracteres.',
  })
  adminNote: string;
}
