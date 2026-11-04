import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
} from '@nestjs/common';
import { StoreService } from './store.service';
import { CreateStoreDto } from './dto/create-store.dto';
import { UpdateStoreDto } from './dto/update-store.dto';
import { Auth } from 'src/auth/decorators/auth.decorator';
import { GetUser } from 'src/auth/decorators/get-user.decorator';
import { GetOptionalUser } from 'src/auth/decorators/get-optional-user.decorator';
import { OptionalJwtAuthGuard } from 'src/auth/guards/optional-jwt-auth.guard';
import { User } from 'src/user/entities/user.entity';
import { StorePaginationDto } from './dto/store-pagination.dto';

import { BlockCustomerDto } from './dto/block-customer.dto';
import { CreateMediationRequestDto } from './dto/create-mediation-request.dto';
import { RespondMediationRequestDto } from './dto/respond-mediation-request.dto';

@Controller('stores')
export class StoreController {
  constructor(private readonly storeService: StoreService) {}

  @Auth()
  @Post()
  create(@Body() createStoreDto: CreateStoreDto, @GetUser() user: User) {
    return this.storeService.create(createStoreDto, user);
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Get()
  findAll(
    @Query() storePaginationDto: StorePaginationDto,
    @GetOptionalUser() user: User | null,
  ) {
    return this.storeService.findAll(storePaginationDto, user);
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Get('latest')
  findLatestWithItems(
    @Query('limit') limit?: number,
    @GetOptionalUser() user?: User | null,
  ) {
    return this.storeService.findLatestWithItems(limit, user);
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Get(':id')
  findOne(
    @Param('id') id: string,
    @GetOptionalUser() user: User | null,
  ) {
    return this.storeService.findOne(id, user);
  }

  @Auth()
  @Get(':id/dashboard')
  getDashboard(@Param('id') id: string) {
    return this.storeService.getStoreDashboardData(id);
  }

  @Auth()
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateStoreDto: UpdateStoreDto,
    @GetUser() user: User,
  ) {
    return this.storeService.update(id, updateStoreDto, user);
  }

  @Auth()
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.storeService.remove(id);
  }

  // --- Branch Lifecycle Endpoints (Deactivation & Scheduled Deletion) ---

  @Auth()
  @Post(':id/lifecycle/validate-preflight')
  validateLifecyclePreflight(
    @Param('id') storeId: string,
    @GetUser() user: User,
  ) {
    return this.storeService.validateLifecyclePreflight(storeId, user);
  }

  @Auth()
  @Post(':id/lifecycle/request-otp')
  requestLifecycleOtp(
    @Param('id') storeId: string,
    @Body('actionType') actionType: 'DEACTIVATE' | 'SCHEDULE_DELETION',
    @GetUser() user: User,
  ) {
    return this.storeService.requestLifecycleOtp(storeId, actionType, user);
  }

  @Auth()
  @Post(':id/lifecycle/deactivate')
  deactivateBranch(
    @Param('id') storeId: string,
    @Body('otpCode') otpCode: string,
    @GetUser() user: User,
  ) {
    return this.storeService.executeDeactivateBranch(storeId, otpCode, user);
  }

  @Auth()
  @Post(':id/lifecycle/reactivate')
  reactivateBranch(
    @Param('id') storeId: string,
    @GetUser() user: User,
  ) {
    return this.storeService.executeReactivateBranch(storeId, user);
  }

  @Auth()
  @Post(':id/lifecycle/schedule-deletion')
  scheduleBranchDeletion(
    @Param('id') storeId: string,
    @Body('otpCode') otpCode: string,
    @GetUser() user: User,
  ) {
    return this.storeService.executeScheduleBranchDeletion(
      storeId,
      otpCode,
      user,
    );
  }

  @Auth()
  @Post(':id/lifecycle/cancel-deletion')
  cancelScheduledDeletion(
    @Param('id') storeId: string,
    @GetUser() user: User,
  ) {
    return this.storeService.executeCancelScheduledDeletion(storeId, user);
  }

  // --- Customer Blocking & Mediation Endpoints ---

  @Auth()
  @Post(':id/blocks')
  blockCustomer(
    @Param('id') storeId: string,
    @Body() dto: BlockCustomerDto,
    @GetUser() user: User,
  ) {
    return this.storeService.blockCustomerByEmailOrId(storeId, dto, user);
  }

  @Auth()
  @Post(':id/blocks/:customerId')
  blockCustomerById(
    @Param('id') storeId: string,
    @Param('customerId') customerId: string,
    @Body() dto: BlockCustomerDto,
    @GetUser() user: User,
  ) {
    return this.storeService.blockCustomer(storeId, customerId, dto, user);
  }

  @Auth()
  @Delete(':id/blocks/:customerId')
  unblockCustomer(
    @Param('id') storeId: string,
    @Param('customerId') customerId: string,
    @GetUser() user: User,
  ) {
    return this.storeService.unblockCustomer(storeId, customerId, user);
  }

  @Auth()
  @Get(':id/blocks')
  getBlockedCustomers(@Param('id') storeId: string, @GetUser() user: User) {
    return this.storeService.getBlockedCustomers(storeId, user);
  }

  @Auth()
  @Get(':id/my-block-status')
  checkBlockStatus(@Param('id') storeId: string, @GetUser() user: User) {
    return this.storeService.isCustomerBlocked(storeId, user.id);
  }

  @Auth()
  @Post(':id/mediation-requests')
  createMediationRequest(
    @Param('id') storeId: string,
    @Body() dto: CreateMediationRequestDto,
    @GetUser() user: User,
  ) {
    return this.storeService.createMediationRequest(storeId, user.id, dto);
  }

  @Auth()
  @Get(':id/mediation-requests')
  getMediationRequests(@Param('id') storeId: string, @GetUser() user: User) {
    return this.storeService.getMediationRequests(storeId, user);
  }

  @Auth()
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
