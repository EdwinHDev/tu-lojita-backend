import { IsOptional, IsUUID } from "class-validator";
import { PaginationDto } from "src/common/dto/pagination.dto";

export class OrderItemPaginationDto extends PaginationDto {

  @IsOptional()
  @IsUUID('4', { message: 'El ID de la orden debe ser un UUID válido' })
  orderId?: string;

  @IsOptional()
  @IsUUID('4', { message: 'El ID de la tienda debe ser un UUID válido' })
  storeId?: string;

  @IsOptional()
  @IsUUID('4', { message: 'El ID del producto debe ser un UUID válido' })
  itemId?: string;
}
