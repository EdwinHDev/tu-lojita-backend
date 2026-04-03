import { Controller, Get, Post, Body, Patch, Param, Delete, Query } from '@nestjs/common';
import { PaymentService } from './payment.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { UpdatePaymentDto } from './dto/update-payment.dto';
import { Auth } from 'src/auth/decorators/auth.decorator';
import { GetUser } from 'src/auth/decorators/get-user.decorator';
import { User } from 'src/user/entities/user.entity';
import { PaymentStatus } from './types';
import { PaymentPaginationDto } from './dto/payment-pagination.dto';

@Auth()
@Controller('payment')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Post()
  create(
    @Body() createPaymentDto: CreatePaymentDto,
    @GetUser() user: User,
  ) {
    // Sobrescribir el userId del DTO con el del usuario autenticado por seguridad
    createPaymentDto.userId = user.id;
    return this.paymentService.create(createPaymentDto);
  }

  @Post(':id/verify')
  verify(
    @Param('id') id: string,
    @Body('status') status: PaymentStatus,
    @GetUser() user: User,
  ) {
    return this.paymentService.verifyPayment(id, status, user.id);
  }

  @Get()
  findAll(@Query() paginationDto: PaymentPaginationDto) {
    return this.paymentService.findAll(paginationDto);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.paymentService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updatePaymentDto: UpdatePaymentDto) {
    return this.paymentService.update(id, updatePaymentDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.paymentService.remove(id);
  }
}
