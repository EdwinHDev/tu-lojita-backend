import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsUUID, Min } from 'class-validator';
import { DisputeStatus, DisputeType } from '../types';

export class QueryDisputeDto {
  @IsOptional()
  @IsEnum(DisputeStatus, { message: 'El estado de filtro no es válido.' })
  status?: DisputeStatus;

  @IsOptional()
  @IsEnum(DisputeType, { message: 'El tipo de disputa no es válido.' })
  type?: DisputeType;

  @IsOptional()
  @IsUUID('4', { message: 'El orderId debe ser un UUID válido.' })
  orderId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 20;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number = 0;
}
