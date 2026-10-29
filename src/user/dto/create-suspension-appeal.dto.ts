import {
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class CreateSuspensionAppealDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(10, {
    message: 'La justificación debe tener al menos 10 caracteres explicativos.',
  })
  reason: string;

  @IsArray()
  @IsOptional()
  @IsString({ each: true })
  evidenceUrls?: string[];

  @IsString()
  @IsOptional()
  contactPhone?: string;
}
