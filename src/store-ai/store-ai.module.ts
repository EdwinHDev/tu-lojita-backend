import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Store } from 'src/store/entities/store.entity';
import { PlatformSettingsModule } from 'src/platform-settings/platform-settings.module';
import { CompanyModule } from 'src/company/company.module';
import { AiPromptPreset } from './entities/ai-prompt-preset.entity';
import { StoreAiSettings } from './entities/store-ai-settings.entity';
import { AiKeyVaultService } from './services/ai-key-vault.service';
import { AiPromptPresetService } from './services/ai-prompt-preset.service';
import { StoreAiService } from './services/store-ai.service';
import { AdminAiPresetController } from './controllers/admin-ai-preset.controller';
import { StoreAiController } from './controllers/store-ai.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([AiPromptPreset, StoreAiSettings, Store]),
    PlatformSettingsModule,
    CompanyModule,
  ],
  controllers: [AdminAiPresetController, StoreAiController],
  providers: [AiKeyVaultService, AiPromptPresetService, StoreAiService],
  exports: [AiKeyVaultService, AiPromptPresetService, StoreAiService],
})
export class StoreAiModule {}
