import { Controller, Get, Patch, Param, Body } from '@nestjs/common';
import { PlatformSettingsService } from './platform-settings.service';
import { Auth } from 'src/auth/decorators/auth.decorator';
import { UserRole } from 'src/user/types/user-role.enum';

@Auth(UserRole.ADMIN)
@Controller('admin/platform-settings')
export class PlatformSettingsController {
  constructor(private readonly service: PlatformSettingsService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Patch(':key')
  update(@Param('key') key: string, @Body('value') value: string) {
    return this.service.set(key, value);
  }
}

@Controller('platform-settings')
export class PublicPlatformSettingsController {
  constructor(private readonly service: PlatformSettingsService) {}

  @Get('public')
  getPublicSettings() {
    return this.service.getPublicSettings();
  }
}
