import {
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';
import { DisputeType } from '../types';

export class CreateDisputeDto {
  @IsUUID('4', { message: 'El orderId debe ser un UUID válido.' })
  @IsNotEmpty({ message: 'El orderId es obligatorio.' })
  orderId: string;

  @IsEnum(DisputeType, { message: 'El tipo de disputa no es válido.' })
  @IsNotEmpty({ message: 'El tipo de disputa es obligatorio.' })
  type: DisputeType;

  @IsString({ message: 'La descripción debe ser un texto.' })
  @IsOptional()
  @MinLength(10, {
    message: 'La descripción debe tener al menos 10 caracteres.',
  })
  description?: string;

  @IsString({ message: 'El motivo debe ser un texto.' })
  @IsOptional()
  @MinLength(10, { message: 'El motivo debe tener al menos 10 caracteres.' })
  reason?: string;

  @IsArray({ message: 'Las evidencias deben ser una lista de enlaces.' })
  @IsOptional()
  evidenceUrls?: string[];
}
