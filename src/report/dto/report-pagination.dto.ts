import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsPositive, Min } from 'class-validator';
import {
  ReportCategory,
  ReportStatus,
  ReportType,
} from '../entities/report.entity';

export class ReportPaginationDto {
  @IsOptional()
  @IsPositive()
  @Type(() => Number)
  limit?: number = 20;

  @IsOptional()
  @Min(0)
  @Type(() => Number)
  offset?: number = 0;

  @IsOptional()
  @IsEnum(ReportStatus)
  status?: ReportStatus;

  @IsOptional()
  @IsEnum(ReportType)
  type?: ReportType;

  @IsOptional()
  @IsEnum(ReportCategory)
  category?: ReportCategory;
}
