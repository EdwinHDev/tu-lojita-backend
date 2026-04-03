import { Controller, Get, Post, Body, Patch, Param, Delete, Query } from '@nestjs/common';
import { OrderService } from './order.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { Auth } from 'src/auth/decorators/auth.decorator';
import { GetUser } from 'src/auth/decorators/get-user.decorator';
import { User } from 'src/user/entities/user.entity';
import { OrderPaginationDto } from './dto/order-pagination.dto';

@Auth()
@Controller('order')
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  @Post()
  create(
    @Body() createOrderDto: CreateOrderDto,
    @GetUser() user: User,
  ) {
    // Sobrescribir el userId del DTO con el del usuario autenticado por seguridad
    createOrderDto.userId = user.id;
    return this.orderService.create(createOrderDto);
  }

  @Get()
  findAll(@Query() paginationDto: OrderPaginationDto) {
    return this.orderService.findAll(paginationDto);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.orderService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateOrderDto: UpdateOrderDto) {
    return this.orderService.update(id, updateOrderDto);
  }

  @Post(':id/cancel')
  cancel(
    @Param('id') id: string,
    @GetUser() user: User,
  ) {
    return this.orderService.cancelOrder(id, user.id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.orderService.remove(id);
  }
}
