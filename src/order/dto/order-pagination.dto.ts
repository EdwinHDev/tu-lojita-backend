import { IsBoolean, IsDateString, IsEnum, IsOptional, IsString, IsUUID } from "class-validator";
import { PaginationDto } from "src/common/dto/pagination.dto";
import { OrderStatus } from "../types";
import { Transform } from "class-transformer";

export class OrderPaginationDto extends PaginationDto {

  @IsOptional()
  @IsEnum(OrderStatus, { message: 'Estado de orden no válido' })
  status?: OrderStatus;

  @IsOptional()
  @IsUUID('4', { message: 'El ID del usuario debe ser un UUID válido' })
  userId?: string;

  @IsOptional()
  @IsUUID('4', { message: 'El ID de la tienda debe ser un UUID válido' })
  storeId?: string;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  isPartialPayment?: boolean;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  hasBalance?: boolean;

  @IsOptional()
  @IsDateString({}, { message: 'Fecha de inicio no válida (formato ISO requerido)' })
  startDate?: string;

  @IsOptional()
  @IsDateString({}, { message: 'Fecha de fin no válida (formato ISO requerido)' })
  endDate?: string;
}
