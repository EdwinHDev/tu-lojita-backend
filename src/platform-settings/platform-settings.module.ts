import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlatformSetting } from './entities/platform-setting.entity';
import { PlatformSettingsService } from './platform-settings.service';
import { ExchangeRateSyncService } from './exchange-rate-sync.service';
import {
  PlatformSettingsController,
  PublicPlatformSettingsController,
} from './platform-settings.controller';

@Module({
  imports: [TypeOrmModule.forFeature([PlatformSetting])],
  controllers: [PlatformSettingsController, PublicPlatformSettingsController],
  providers: [PlatformSettingsService, ExchangeRateSyncService],
  exports: [PlatformSettingsService, ExchangeRateSyncService],
})
export class PlatformSettingsModule {}
