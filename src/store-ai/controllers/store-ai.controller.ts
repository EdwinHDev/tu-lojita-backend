import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Auth } from 'src/auth/decorators/auth.decorator';
import { GetUser } from 'src/auth/decorators/get-user.decorator';
import { UserRole } from 'src/user/types/user-role.enum';
import {
  EnhanceStoreImageDto,
  TestStoreAiKeyDto,
  UpdateStoreAiSettingsDto,
} from '../dto/store-ai.dto';
import {
  StoreAiService,
  UploadedImageFile,
} from '../services/store-ai.service';

@Auth(UserRole.COMPANY, UserRole.VENDOR)
@Controller('stores/:storeId/ai-image')
export class StoreAiController {
  constructor(private readonly storeAiService: StoreAiService) {}

  @Get('settings')
  getSettings(
    @Param('storeId', ParseUUIDPipe) storeId: string,
    @GetUser() actor: any,
  ) {
    return this.storeAiService.getSettings(storeId, actor);
  }

  @Post('test-key')
  testKey(
    @Param('storeId', ParseUUIDPipe) storeId: string,
    @Body() dto: TestStoreAiKeyDto,
    @GetUser() actor: any,
  ) {
    return this.storeAiService.testKey(storeId, dto, actor);
  }

  @Patch('settings')
  updateSettings(
    @Param('storeId', ParseUUIDPipe) storeId: string,
    @Body() dto: UpdateStoreAiSettingsDto,
    @GetUser() actor: any,
  ) {
    return this.storeAiService.updateSettings(storeId, dto, actor);
  }

  @Delete('settings/key')
  deleteKey(
    @Param('storeId', ParseUUIDPipe) storeId: string,
    @GetUser() actor: any,
  ) {
    return this.storeAiService.deleteKey(storeId, actor);
  }

  @Get('catalog')
  getCatalog(
    @Param('storeId', ParseUUIDPipe) storeId: string,
    @GetUser() actor: any,
  ) {
    return this.storeAiService.getCatalog(storeId, actor);
  }

  @Post('enhance')
  @UseInterceptors(
    FileInterceptor('image', {
      limits: { fileSize: 8 * 1024 * 1024 },
    }),
  )
  enhanceImage(
    @Param('storeId', ParseUUIDPipe) storeId: string,
    @UploadedFile() file: UploadedImageFile | undefined,
    @Body() dto: EnhanceStoreImageDto,
    @GetUser() actor: any,
  ) {
    return this.storeAiService.enhanceImage(storeId, file, dto, actor);
  }
}
