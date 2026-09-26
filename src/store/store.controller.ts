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
import { StoreService } from './store.service';
import { CreateStoreDto } from './dto/create-store.dto';
import { UpdateStoreDto } from './dto/update-store.dto';
import { Auth } from 'src/auth/decorators/auth.decorator';
import { GetUser } from 'src/auth/decorators/get-user.decorator';
import { User } from 'src/user/entities/user.entity';
import { StorePaginationDto } from './dto/store-pagination.dto';

import { BlockCustomerDto } from './dto/block-customer.dto';
import { CreateMediationRequestDto } from './dto/create-mediation-request.dto';
import { RespondMediationRequestDto } from './dto/respond-mediation-request.dto';

@Auth()
@Controller('stores')
export class StoreController {
  constructor(private readonly storeService: StoreService) {}

  @Post()
  create(@Body() createStoreDto: CreateStoreDto, @GetUser() user: User) {
    return this.storeService.create(createStoreDto, user);
  }

  @Get()
  findAll(
    @Query() storePaginationDto: StorePaginationDto,
    @GetUser() user: User,
  ) {
    return this.storeService.findAll(storePaginationDto, user);
  }

  @Get('latest')
  findLatestWithItems(
    @Query('limit') limit?: number,
    @GetUser() user?: User,
  ) {
    return this.storeService.findLatestWithItems(limit, user);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.storeService.findOne(id);
  }

  @Get(':id/dashboard')
  getDashboard(@Param('id') id: string) {
    return this.storeService.getStoreDashboardData(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateStoreDto: UpdateStoreDto,
    @GetUser() user: User,
  ) {
    return this.storeService.update(id, updateStoreDto, user);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.storeService.remove(id);
  }

  // --- Customer Blocking & Mediation Endpoints ---

  @Post(':id/blocks')
  blockCustomer(
    @Param('id') storeId: string,
    @Body() dto: BlockCustomerDto,
    @GetUser() user: User,
  ) {
    return this.storeService.blockCustomerByEmailOrId(storeId, dto, user);
  }

  @Post(':id/blocks/:customerId')
  blockCustomerById(
    @Param('id') storeId: string,
    @Param('customerId') customerId: string,
    @Body() dto: BlockCustomerDto,
    @GetUser() user: User,
  ) {
    return this.storeService.blockCustomer(storeId, customerId, dto, user);
  }

  @Delete(':id/blocks/:customerId')
  unblockCustomer(
    @Param('id') storeId: string,
    @Param('customerId') customerId: string,
    @GetUser() user: User,
  ) {
    return this.storeService.unblockCustomer(storeId, customerId, user);
  }

  @Get(':id/blocks')
  getBlockedCustomers(@Param('id') storeId: string, @GetUser() user: User) {
    return this.storeService.getBlockedCustomers(storeId, user);
  }

  @Get(':id/my-block-status')
  checkBlockStatus(@Param('id') storeId: string, @GetUser() user: User) {
    return this.storeService.isCustomerBlocked(storeId, user.id);
  }

  @Post(':id/mediation-requests')
  createMediationRequest(
    @Param('id') storeId: string,
    @Body() dto: CreateMediationRequestDto,
    @GetUser() user: User,
  ) {
    return this.storeService.createMediationRequest(storeId, user.id, dto);
  }

  @Get(':id/mediation-requests')
  getMediationRequests(@Param('id') storeId: string, @GetUser() user: User) {
    return this.storeService.getMediationRequests(storeId, user);
  }

  @Patch(':id/mediation-requests/:requestId')
  respondMediationRequest(
    @Param('id') storeId: string,
    @Param('requestId') requestId: string,
    @Body() dto: RespondMediationRequestDto,
    @GetUser() user: User,
  ) {
    return this.storeService.respondMediationRequest(
      storeId,
      requestId,
      dto,
      user,
    );
  }
}

