import {
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ReportAction, ReportStatus } from '../entities/report.entity';

export class ResolveReportDto {
  @IsOptional()
  @IsEnum(ReportStatus)
  status?: ReportStatus;

  @IsNotEmpty()
  @IsEnum(ReportAction)
  actionTaken: ReportAction;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  adminNotes?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  evidenceMessages?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  strikeReason?: string;
}
