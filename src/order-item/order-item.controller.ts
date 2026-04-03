import { Controller, Get, Param, Query } from '@nestjs/common';
import { OrderItemService } from './order-item.service';
import { Auth } from 'src/auth/decorators/auth.decorator';
import { OrderItemPaginationDto } from './dto/order-item-pagination.dto';

@Auth()
@Controller('order-item')
export class OrderItemController {
  constructor(private readonly orderItemService: OrderItemService) {}

  @Get()
  findAll(@Query() paginationDto: OrderItemPaginationDto) {
    return this.orderItemService.findAll(paginationDto);
  }

  @Get('order/:orderId')
  findByOrder(@Param('orderId') orderId: string) {
    return this.orderItemService.findByOrder(orderId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.orderItemService.findOne(id);
  }
}
