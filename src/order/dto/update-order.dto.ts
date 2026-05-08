import { PartialType } from '@nestjs/mapped-types';
import { CreateOrderDto } from './create-order.dto';
import { IsEnum, IsOptional } from 'class-validator';
import { OrderStatus } from '../types';

export class UpdateOrderDto extends PartialType(CreateOrderDto) {
  @IsEnum(OrderStatus, { message: 'El estado debe ser un valor válido' })
  @IsOptional()
  status?: OrderStatus;

  @IsOptional()
  rejectionReason?: string;
}
