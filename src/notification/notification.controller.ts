import { Controller, Get, Patch, Param, Req } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { Auth } from '../auth/decorators/auth.decorator';

@Controller('notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Auth()
  @Get()
  findAll(@Req() req: { user: { id: string } }) {
    return this.notificationService.findAllByUser(req.user.id);
  }

  @Auth()
  @Patch(':id/read')
  markAsRead(@Param('id') id: string) {
    return this.notificationService.markAsRead(id);
  }
}
