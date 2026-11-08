import { Global, Module } from '@nestjs/common';
import { MailService } from './mail.service';
import { MailController } from './mail.controller';
import { PlatformSettingsModule } from 'src/platform-settings/platform-settings.module';

@Global()
@Module({
  imports: [PlatformSettingsModule],
  controllers: [MailController],
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}

