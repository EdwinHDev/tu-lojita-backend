import { Controller, Get, Patch, Post, Param, Body } from '@nestjs/common';
import { PlatformSettingsService, PLATFORM_KEYS } from './platform-settings.service';
import { ExchangeRateSyncService } from './exchange-rate-sync.service';
import { Auth } from 'src/auth/decorators/auth.decorator';
import { UserRole } from 'src/user/types/user-role.enum';

@Auth(UserRole.ADMIN)
@Controller('admin/platform-settings')
export class PlatformSettingsController {
  constructor(
    private readonly service: PlatformSettingsService,
    private readonly syncService: ExchangeRateSyncService,
  ) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Post('exchange-rate/sync')
  syncExchangeRate() {
    return this.syncService.syncExchangeRate();
  }

  @Patch('exchange-rate/config')
  async updateExchangeRateConfig(
    @Body() dto: { enabled?: boolean; mode?: 'AUTO' | 'MANUAL'; manualRate?: number },
  ) {
    if (dto.enabled !== undefined) {
      await this.service.set(PLATFORM_KEYS.BCV_RATE_ENABLED, dto.enabled ? 'true' : 'false');
    }
    if (dto.mode !== undefined) {
      await this.service.set(PLATFORM_KEYS.BCV_RATE_MODE, dto.mode);
    }
    if (dto.manualRate !== undefined && !isNaN(dto.manualRate)) {
      await this.service.set(PLATFORM_KEYS.BCV_RATE_MANUAL_VALUE, dto.manualRate.toString());
    }
    return this.service.getExchangeRateConfig();
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

  @Get('exchange-rate')
  getExchangeRate() {
    return this.service.getExchangeRateConfig();
  }

  @Get('featured-showcase-config')
  getFeaturedShowcaseConfig() {
    return this.service.getFeaturedShowcaseConfig();
  }
}
