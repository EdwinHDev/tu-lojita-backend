import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsBoolean,
  Min,
  Max,
  ValidateNested,
  IsArray,
} from 'class-validator';
import { Type } from 'class-transformer';
import { DepositType } from '../types/deposit-type.enum';
import { ServiceLocationType } from '../types/service-location-type.enum';

export class CreateTimeSlotDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(7)
  dayOfWeek?: number;

  @IsOptional()
  @IsString()
  specificDate?: string;

  @IsString()
  startTime: string; // HH:mm

  @IsString()
  endTime: string; // HH:mm

  @IsString()
  label: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateSlotConfigDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minNoticeHours?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  serviceDurationMinutes?: number;

  @IsOptional()
  @IsBoolean()
  allowSameDay?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(1)
  maxConcurrentBookings?: number;

  @IsOptional()
  @IsEnum(ServiceLocationType)
  serviceLocationType?: ServiceLocationType;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateTimeSlotDto)
  slots?: CreateTimeSlotDto[];
}

export class CreatePreorderConfigDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsOptional()
  @IsEnum(DepositType)
  depositType?: DepositType;

  @IsOptional()
  @IsNumber()
  @Min(0)
  depositValue?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  estimatedLeadDaysMin?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  estimatedLeadDaysMax?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  maxPreOrderUnits?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  settlementWindowHours?: number;
}
