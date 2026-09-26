import { IsArray, IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class RespondDisputeDto {
  @IsString({ message: 'La respuesta del comercio debe ser un texto.' })
  @IsOptional()
  @MinLength(5, { message: 'La respuesta debe tener al menos 5 caracteres.' })
  merchantResponse?: string;

  @IsString({ message: 'La respuesta debe ser un texto.' })
  @IsOptional()
  @MinLength(5, { message: 'La respuesta debe tener al menos 5 caracteres.' })
  response?: string;

  @IsArray({ message: 'Las evidencias deben ser una lista de enlaces.' })
  @IsOptional()
  evidenceUrls?: string[];

  @IsBoolean({ message: 'El campo acceptDispute debe ser un booleano.' })
  @IsOptional()
  acceptDispute?: boolean;
}
