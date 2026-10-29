import {
  IsOptional,
  IsString,
  IsUUID,
  IsEnum,
  IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PaginationDto } from 'src/common/dto/pagination.dto';
import { OrderStatus } from 'src/order/types';

export class SalesLedgerQueryDto extends PaginationDto {
  @IsOptional()
  @Type(() => Number)
  limit?: number = 20;

  @IsOptional()
  @IsString()
  datePreset?: 'today' | 'week' | 'month' | 'year' | 'custom';

  @IsOptional()
  @IsDateString({}, { message: 'startDate debe ser una fecha ISO válida' })
  startDate?: string;

  @IsOptional()
  @IsDateString({}, { message: 'endDate debe ser una fecha ISO válida' })
  endDate?: string;

  @IsOptional()
  @IsUUID('4', { message: 'companyId debe ser un UUID válido' })
  companyId?: string;

  @IsOptional()
  @IsUUID('4', { message: 'storeId debe ser un UUID válido' })
  storeId?: string;

  @IsOptional()
  @IsUUID('4', { message: 'categoryId debe ser un UUID válido' })
  categoryId?: string;

  @IsOptional()
  @IsUUID('4', { message: 'subcategoryId debe ser un UUID válido' })
  subcategoryId?: string;

  @IsOptional()
  @IsEnum(OrderStatus, { message: 'status debe ser un estado de orden válido' })
  status?: OrderStatus;

  @IsOptional()
  @IsString()
  commissionStatus?: 'ALL' | 'COLLECTED' | 'PENDING' | 'EXEMPT' | 'VOIDED';

  @IsOptional()
  @IsString()
  search?: string;
}
