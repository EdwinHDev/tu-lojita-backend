import { IsEnum, IsOptional, IsString, IsUUID } from "class-validator";
import { PaginationDto } from "src/common/dto/pagination.dto";
import { PaymentStatus } from "../types";

export class PaymentPaginationDto extends PaginationDto {

  @IsOptional()
  @IsEnum(PaymentStatus, { message: 'Estado de pago no válido' })
  status?: PaymentStatus;

  @IsOptional()
  @IsString({ message: 'El método de pago debe ser una cadena de texto' })
  paymentMethod?: string;

  @IsOptional()
  @IsString({ message: 'La moneda debe ser una cadena de texto' })
  currency?: string;

  @IsOptional()
  @IsString({ message: 'La referencia debe ser una cadena de texto' })
  reference?: string;

  @IsOptional()
  @IsUUID('4', { message: 'El ID de la tienda debe ser un UUID válido' })
  storeId?: string;

  @IsOptional()
  @IsUUID('4', { message: 'El ID del usuario debe ser un UUID válido' })
  userId?: string;
}
