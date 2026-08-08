import { ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { CreateOrderDto } from 'src/order/dto/create-order.dto';
import { CreatePaymentDto } from './create-payment.dto';

export class CreatePaymentWithOrderDto {
  @ValidateNested()
  @Type(() => CreateOrderDto)
  order: CreateOrderDto;

  @ValidateNested()
  @Type(() => CreatePaymentDto)
  payment: CreatePaymentDto;
}
