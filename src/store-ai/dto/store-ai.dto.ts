import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class StoreSavedPromptDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  id?: string;

  @IsString()
  @IsNotEmpty({ message: 'El título del prompt es obligatorio.' })
  @MaxLength(60, { message: 'El título no puede superar 60 caracteres.' })
  title: string;

  @IsString()
  @IsNotEmpty({ message: 'La instrucción del prompt es obligatoria.' })
  @MaxLength(500, {
    message: 'La instrucción del prompt no puede superar 500 caracteres.',
  })
  prompt: string;
}

export class TestStoreAiKeyDto {
  @IsString()
  @IsNotEmpty({ message: 'Debes ingresar una API Key de Google Gemini.' })
  @MinLength(16, { message: 'El formato de la API Key es demasiado corto.' })
  @MaxLength(256, { message: 'El formato de la API Key excede el límite.' })
  apiKey: string;

  @IsOptional()
  @IsBoolean()
  saveIfValid?: boolean;
}

export class UpdateStoreAiSettingsDto {
  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @IsOptional()
  @IsString()
  @MinLength(16, { message: 'El formato de la API Key es demasiado corto.' })
  @MaxLength(256, { message: 'El formato de la API Key excede el límite.' })
  apiKey?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  dailyLimit?: number;

  @IsOptional()
  @IsArray({ message: 'Los prompts propios deben enviarse como una lista.' })
  @ArrayMaxSize(3, {
    message: 'Solo puedes guardar un máximo de 3 prompts propios por tienda.',
  })
  @ValidateNested({ each: true })
  @Type(() => StoreSavedPromptDto)
  customPrompts?: StoreSavedPromptDto[];
}

export class EnhanceStoreImageDto {
  @IsOptional()
  @IsUUID('4', { message: 'El identificador de preset oficial no es válido.' })
  presetId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  storePromptId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(400, {
    message: 'El prompt personalizado no puede superar 400 caracteres.',
  })
  customPrompt?: string;
}
