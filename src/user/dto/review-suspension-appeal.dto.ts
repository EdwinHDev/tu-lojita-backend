import { IsBoolean, IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { AppealStatus } from '../entities/suspension-appeal.entity';

export class ReviewSuspensionAppealDto {
  @IsEnum(AppealStatus, {
    message: 'El estado debe ser APPROVED, REJECTED o MORE_INFO_REQUESTED.',
  })
  @IsNotEmpty()
  status: AppealStatus;

  @IsString()
  @IsOptional()
  adminNotes?: string;

  @IsString()
  @IsOptional()
  requestedInfo?: string;

  @IsBoolean()
  @IsOptional()
  allowReappeal?: boolean;
}
