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
import { ManualPaymentDto } from './dto/manual-payment.dto';
import { CancelOrderDto } from './dto/cancel-order.dto';
import { Auth } from 'src/auth/decorators/auth.decorator';
import { GetUser } from 'src/auth/decorators/get-user.decorator';
import { User } from 'src/user/entities/user.entity';
import { OrderPaginationDto } from './dto/order-pagination.dto';
import { transformUserDataByRole } from '../common/utils/transform-user-data.util';
import { CompanyPermission } from 'src/company/types/company-permission.enum';

@Auth()
@Controller('order')
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  private sanitizeOrderForActor(order: any, requestingUser: any) {
    const transformedUser = transformUserDataByRole(
      order.user,
      requestingUser.role,
      requestingUser.id,
    );

    const isCollaborator = Boolean(requestingUser?.isCollaborator);
    if (!isCollaborator) {
      return {
        ...order,
        user: transformedUser,
      };
    }

    const perms: string[] = Array.isArray(requestingUser.permissions)
      ? requestingUser.permissions
      : [];
    const canViewCustomerData = perms.includes(
      CompanyPermission.ORDERS_VIEW_CUSTOMER_DATA,
    );
    const canViewFinancial =
      perms.includes(CompanyPermission.FINANCES_VIEW_SENSITIVE) ||
      perms.includes(CompanyPermission.METRICS_VIEW_FINANCIAL);

    const safeUser =
      transformedUser && !canViewCustomerData
        ? {
            ...transformedUser,
            email: null,
            phone: null,
            addresses: [],
            identification: null,
          }
        : transformedUser;

    if (canViewFinancial) {
      return {
        ...order,
        user: safeUser,
      };
    }

    const sanitizedItems = Array.isArray(order.orderItems)
      ? order.orderItems.map((orderItem: any) => ({
          ...orderItem,
          basePrice: orderItem.price ?? 0,
          commissionRate: 0,
          commissionAmount: 0,
          item: orderItem.item
            ? {
                ...orderItem.item,
                basePrice: orderItem.item.price ?? orderItem.price ?? 0,
                commissionRate: 0,
                commissionAmount: 0,
              }
            : orderItem.item,
        }))
      : order.orderItems;

    return {
      ...order,
      user: safeUser,
      platformCommissionRate: 0,
      platformCommissionAmount: 0,
      orderItems: sanitizedItems,
    };
  }

  @Post('validate-cart')
  validateCart(
    @Body() validateCartDto: ValidateCartDto,
    @GetUser() user: User,
  ) {
    return this.orderService.validateCart(validateCartDto, user?.id);
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

    const transformedItems = result.items.map((order) =>
      this.sanitizeOrderForActor(order, requestingUser),
    );

    return {
      ...result,
      items: transformedItems,
    };
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @GetUser() requestingUser: User) {
    const order = await this.orderService.findOne(id, requestingUser);
    return this.sanitizeOrderForActor(order, requestingUser);
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
  cancel(
    @Param('id') id: string,
    @GetUser() user: User,
    @Body() cancelOrderDto?: CancelOrderDto,
  ) {
    return this.orderService.cancelOrder(id, user.id, cancelOrderDto, user);
  }

  @Post(':id/accept-payment-not-received')
  acceptPaymentNotReceived(@Param('id') id: string, @GetUser() user: User) {
    return this.orderService.acceptPaymentNotReceived(id, user.id);
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
    return this.orderService.requestExtension(
      id,
      requestedDays,
      reason,
      user.id,
    );
  }

  @Post('installment/:id/verify-extension')
  verifyExtension(
    @Param('id') id: string,
    @Body('status') status: 'APPROVED' | 'REJECTED',
    @Body('merchantComment') merchantComment: string,
    @GetUser() user: User,
  ) {
    return this.orderService.verifyExtension(
      id,
      status,
      merchantComment,
      user.id,
    );
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
  getOrderStatement(@Param('id') id: string, @GetUser() user: User) {
    return this.orderService.getOrderStatement(id, user.id, user.role);
  }

  @Post(':id/manual-payment')
  registerManualPayment(
    @Param('id') id: string,
    @Body() manualPaymentDto: ManualPaymentDto,
    @GetUser() user: User,
  ) {
    return this.orderService.registerManualPayment(
      id,
      manualPaymentDto,
      user.id,
    );
  }

  @Patch(':id/preorder-stock-arrived')
  markPreOrderStockArrived(@Param('id') id: string, @GetUser() user: User) {
    return this.orderService.markPreOrderStockArrived(id, user);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.orderService.remove(id);
  }
}
