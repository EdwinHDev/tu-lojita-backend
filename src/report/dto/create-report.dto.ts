import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { ReportCategory, ReportType } from '../entities/report.entity';

export class CreateReportDto {
  @IsNotEmpty()
  @IsEnum(ReportType)
  type: ReportType;

  @IsNotEmpty()
  @IsEnum(ReportCategory)
  category: ReportCategory;

  @IsNotEmpty()
  @IsString()
  @MaxLength(1000)
  reason: string;

  @IsOptional()
  @IsString()
  evidenceUrl?: string;

  @IsOptional()
  @IsUUID()
  targetStoreId?: string;

  @IsOptional()
  @IsUUID()
  targetItemId?: string;

  @IsOptional()
  @IsUUID()
  targetChatMessageId?: string;

  @IsOptional()
  @IsUUID()
  targetUserId?: string;
}
