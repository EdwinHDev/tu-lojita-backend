import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { MediationStatus } from '../entities/mediation-request.entity';

export class RespondMediationRequestDto {
  @IsNotEmpty()
  @IsEnum(MediationStatus)
  status: MediationStatus;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  storeResponse?: string;
}
