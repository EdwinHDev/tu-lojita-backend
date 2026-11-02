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
import { ItemService } from './item.service';
import { CreateItemDto } from './dto/create-item.dto';
import { UpdateItemDto } from './dto/update-item.dto';
import { ItemPaginationDto } from './dto/item-pagination.dto';
import { Auth } from 'src/auth/decorators/auth.decorator';
import { GetUser } from 'src/auth/decorators/get-user.decorator';
import { User } from 'src/user/entities/user.entity';
import { BookingService } from './booking.service';
import {
  CreateSlotConfigDto,
  CreatePreorderConfigDto,
} from './dto/booking-config.dto';
import { UserRole } from 'src/user/types/user-role.enum';
import { RequestPromotionDto } from './dto/request-promotion.dto';
import { ItemPromotionStatus } from './types/item-promotion-status.enum';

@Controller('items')
export class PublicItemController {
  constructor(private readonly itemService: ItemService) {}

  @Get('featured-showcase')
  getFeaturedShowcase() {
    return this.itemService.getFeaturedShowcase();
  }
}

@Auth()
@Controller('items')
export class ItemController {
  constructor(
    private readonly itemService: ItemService,
    private readonly bookingService: BookingService,
  ) {}

  @Post()
  create(@Body() createItemDto: CreateItemDto, @GetUser() user: User) {
    return this.itemService.create(createItemDto, user);
  }

  @Get()
  findAll(@Query() paginationDto: ItemPaginationDto, @GetUser() user: User) {
    return this.itemService.findAll(paginationDto, user);
  }

  @Get('store/:storeId')
  findByStore(
    @Param('storeId') storeId: string,
    @Query() paginationDto: ItemPaginationDto,
    @GetUser() user: User,
  ) {
    return this.itemService.findByStore(storeId, paginationDto, user);
  }

  @Get(':id/available-slots')
  getAvailableSlots(@Param('id') id: string, @Query('date') date: string) {
    return this.bookingService.getAvailableSlots(id, date);
  }

  @Post(':id/slots/hold')
  acquireSlotHold(
    @Param('id') id: string,
    @Body() body: { timeSlotId: string; date: string },
    @GetUser() user: User,
  ) {
    return this.bookingService.acquireSlotHold(
      id,
      body.timeSlotId,
      body.date,
      user,
    );
  }

  @Post(':id/slot-config')
  configureSlotConfig(
    @Param('id') id: string,
    @Body() dto: CreateSlotConfigDto,
    @GetUser() user: User,
  ) {
    return this.bookingService.configureSlotBooking(id, dto, user);
  }

  @Post(':id/preorder-config')
  configurePreorderConfig(
    @Param('id') id: string,
    @Body() dto: CreatePreorderConfigDto,
    @GetUser() user: User,
  ) {
    return this.bookingService.configurePreorder(id, dto, user);
  }

  @Get('admin/all')
  @Auth(UserRole.ADMIN)
  findAllForAdmin(@Query() query: any) {
    return this.itemService.findAllForAdmin(query);
  }

  @Get('admin/promotions')
  @Auth(UserRole.ADMIN)
  getPromotionsForAdmin(@Query('status') status?: ItemPromotionStatus) {
    return this.itemService.getPromotionsForAdmin(status);
  }

  @Get('admin/showcase-status')
  @Auth(UserRole.ADMIN)
  getShowcaseStatusForAdmin() {
    return this.itemService.getShowcaseStatusForAdmin();
  }

  @Patch('admin/promotions/:id/approve')
  @Auth(UserRole.ADMIN)
  approvePromotion(@Param('id') id: string, @GetUser() user: User) {
    return this.itemService.approvePromotion(id, user);
  }

  @Patch('admin/promotions/:id/reject')
  @Auth(UserRole.ADMIN)
  rejectPromotion(
    @Param('id') id: string,
    @Body('reason') reason: string,
    @GetUser() user: User,
  ) {
    return this.itemService.rejectPromotion(id, reason, user);
  }

  @Post(':id/promote')
  requestPromotion(
    @Param('id') id: string,
    @Body() dto: RequestPromotionDto,
    @GetUser() user: User,
  ) {
    return this.itemService.requestPromotion(id, user, dto);
  }

  @Get(':id/promotion-status')
  getItemPromotionStatus(@Param('id') id: string, @GetUser() user: User) {
    return this.itemService.getItemPromotionStatus(id, user);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @GetUser() user: User) {
    return this.itemService.findOne(id, user);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateItemDto: UpdateItemDto,
    @GetUser() user: User,
  ) {
    return this.itemService.update(id, updateItemDto, user);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @GetUser() user: User) {
    return this.itemService.remove(id, user);
  }
}
