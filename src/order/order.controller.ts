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
import { ValidateCartDto } from './dto/validate-cart.dto';
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

  @Post('validate-cart')
  validateCart(@Body() validateCartDto: ValidateCartDto) {
    return this.orderService.validateCart(validateCartDto);
  }

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

  @Get('store/:storeId/installments')
  findStoreInstallments(@Param('storeId') storeId: string) {
    return this.orderService.findStoreInstallments(storeId);
  }

  @Post('installment/:id/request-extension')
  requestExtension(
    @Param('id') id: string,
    @Body('requestedDays') requestedDays: number,
    @Body('reason') reason: string,
    @GetUser() user: User,
  ) {
    return this.orderService.requestExtension(id, requestedDays, reason, user.id);
  }

  @Post('installment/:id/verify-extension')
  verifyExtension(
    @Param('id') id: string,
    @Body('status') status: 'APPROVED' | 'REJECTED',
    @Body('merchantComment') merchantComment: string,
    @GetUser() user: User,
  ) {
    return this.orderService.verifyExtension(id, status, merchantComment, user.id);
  }

  @Get('user/installments/calendar')
  getUserInstallmentsCalendar(@GetUser() user: User) {
    return this.orderService.getUserInstallmentsCalendar(user.id);
  }

  @Get('store/:storeId/installments/receivables')
  getStoreReceivables(
    @Param('storeId') storeId: string,
    @GetUser() user: User,
  ) {
    return this.orderService.getStoreReceivables(storeId, user.id);
  }

  @Get(':id/statement')
  getOrderStatement(
    @Param('id') id: string,
    @GetUser() user: User,
  ) {
    return this.orderService.getOrderStatement(id, user.id, user.role);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.orderService.remove(id);
  }
}
