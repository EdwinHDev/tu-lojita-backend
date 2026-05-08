import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
import { StorePaymentMethodService } from './store-payment-method.service';
import { CreateStorePaymentMethodDto, UpdateStorePaymentMethodDto } from './dto/create-store-payment-method.dto';
import { Auth } from 'src/auth/decorators/auth.decorator';
import { GetUser } from 'src/auth/decorators/get-user.decorator';
import { User } from 'src/user/entities/user.entity';

@Controller('store-payment-methods')
export class StorePaymentMethodController {
  constructor(private readonly service: StorePaymentMethodService) {}

  @Post()
  @Auth()
  create(
    @Body() createDto: CreateStorePaymentMethodDto,
    @GetUser() user: User,
  ) {
    return this.service.create(createDto, user.id);
  }

  @Get('my-store')
  @Auth()
  findMyStoreMethods(@GetUser() user: User) {
    return this.service.findMyStoreMethods(user.id);
  }

  @Get('store/:storeId')
  findAllByStore(@Param('storeId') storeId: string) {
    return this.service.findAllByStore(storeId);
  }

  @Get('store/:storeId/management')
  @Auth()
  findStoreMethodsForManagement(
    @Param('storeId') storeId: string,
    @GetUser() user: User,
  ) {
    return this.service.findStoreMethodsForManagement(storeId, user.id);
  }

  @Patch(':id')
  @Auth()
  update(
    @Param('id') id: string,
    @Body() updateDto: UpdateStorePaymentMethodDto,
    @GetUser() user: User,
  ) {
    return this.service.update(id, updateDto, user.id);
  }

  @Delete(':id')
  @Auth()
  remove(@Param('id') id: string, @GetUser() user: User) {
    return this.service.remove(id, user.id);
  }
}
