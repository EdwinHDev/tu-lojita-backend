import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RequestAccountDeletionDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

