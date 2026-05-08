import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
} from '@nestjs/common';
import { OrderService } from './order.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { Auth } from 'src/auth/decorators/auth.decorator';
import { GetUser } from 'src/auth/decorators/get-user.decorator';
import { User } from 'src/user/entities/user.entity';
import { OrderPaginationDto } from './dto/order-pagination.dto';
import { transformUserDataByRole } from '../common/utils/transform-user-data.util';

@Auth()
@Controller('order')
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  @Post()
  create(@Body() createOrderDto: CreateOrderDto, @GetUser() user: User) {
    // El userId se obtiene del usuario autenticado, no del body
    return this.orderService.create(createOrderDto, user.id);
  }

  @Get()
  async findAll(
    @Query() paginationDto: OrderPaginationDto,
    @GetUser() requestingUser: User,
  ) {
    const result = await this.orderService.findAll(
      paginationDto,
      requestingUser,
    );

    const transformedItems = result.items.map((order) => ({
      ...order,
      user: transformUserDataByRole(
        order.user,
        requestingUser.role,
        requestingUser.id,
      ),
    }));

    return {
      ...result,
      items: transformedItems,
    };
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @GetUser() requestingUser: User) {
    const order = await this.orderService.findOne(id);

    return {
      ...order,
      user: transformUserDataByRole(
        order.user,
        requestingUser.role,
        requestingUser.id,
      ),
    };
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateOrderDto: UpdateOrderDto,
    @GetUser() requestingUser: User,
  ) {
    return this.orderService.update(id, updateOrderDto, requestingUser);
  }

  @Post(':id/cancel')
  cancel(@Param('id') id: string, @GetUser() user: User) {
    return this.orderService.cancelOrder(id, user.id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.orderService.remove(id);
  }
}
