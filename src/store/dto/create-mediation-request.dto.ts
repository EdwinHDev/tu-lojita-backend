import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { MediationTopic } from '../entities/mediation-request.entity';

export class CreateMediationRequestDto {
  @IsNotEmpty()
  @IsEnum(MediationTopic)
  topic: MediationTopic;

  @IsNotEmpty()
  @IsString()
  @MaxLength(1000)
  message: string;

  @IsOptional()
  @IsString()
  attachmentUrl?: string;
}
