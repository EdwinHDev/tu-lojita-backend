import { Controller, Get, Patch, Post, Param, Req, Body } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { Auth } from '../auth/decorators/auth.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { User } from '../user/entities/user.entity';
import { UserRole } from '../user/types';
import { RegisterDeviceDto } from './dto/register-device.dto';
import { UnregisterDeviceDto } from './dto/unregister-device.dto';
import {
  PenalizeChatUserDto,
  LiftChatSuspensionDto,
} from './dto/penalize-chat-user.dto';

@Controller(['notifications', 'notification', 'admin'])
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Auth()
  @Get()
  findAll(@Req() req: { user: { id: string } }) {
    return this.notificationService.findAllByUser(req.user.id);
  }

  @Auth()
  @Post('register-device')
  registerDevice(
    @Req() req: { user: { id: string } },
    @Body() dto: RegisterDeviceDto,
  ) {
    return this.notificationService.registerDevice(req.user.id, dto);
  }

  @Auth()
  @Post('unregister-device')
  unregisterDevice(
    @Req() req: { user: { id: string } },
    @Body() dto: UnregisterDeviceDto,
  ) {
    return this.notificationService.unregisterDevice(req.user.id, dto);
  }

  @Auth()
  @Get('unread-disputes')
  getUnreadDisputes(@Req() req: { user: { id: string } }) {
    return this.notificationService.getUnreadDisputeOrderIds(req.user.id);
  }

  @Auth()
  @Patch(':id/read')
  markAsRead(@Param('id') id: string) {
    return this.notificationService.markAsRead(id);
  }

  @Auth()
  @Patch('order/:orderId/dispute-read')
  markDisputeRead(
    @Req() req: { user: { id: string } },
    @Param('orderId') orderId: string,
  ) {
    return this.notificationService.markDisputeNotificationsAsRead(
      req.user.id,
      orderId,
    );
  }

  @Auth()
  @Get('order/:orderId/chat')
  getOrderChatHistory(
    @Param('orderId') orderId: string,
    @GetUser() user: User,
  ) {
    return this.notificationService.getOrderChatHistory(orderId, user);
  }

  @Auth(UserRole.ADMIN)
  @Post('chat/penalize-user')
  penalizeUser(@Body() dto: PenalizeChatUserDto) {
    return this.notificationService.penalizeChatUser(dto);
  }

  @Auth(UserRole.ADMIN)
  @Post('chat/lift-suspension')
  liftSuspension(@Body() dto: LiftChatSuspensionDto) {
    return this.notificationService.liftChatSuspension(dto);
  }

  @Auth(UserRole.ADMIN)
  @Get('badges/summary')
  getAdminBadgesSummary() {
    return this.notificationService.getAdminBadgesSummary();
  }
}

