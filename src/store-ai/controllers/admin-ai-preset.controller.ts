import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { Auth } from 'src/auth/decorators/auth.decorator';
import { UserRole } from 'src/user/types/user-role.enum';
import { AiPromptPresetService } from '../services/ai-prompt-preset.service';
import {
  CreateAiPromptPresetDto,
  ReorderAiPromptPresetsDto,
  UpdateAiPromptPresetDto,
} from '../dto/ai-prompt-preset.dto';

@Auth(UserRole.ADMIN)
@Controller('admin/ai-image/presets')
export class AdminAiPresetController {
  constructor(private readonly presetService: AiPromptPresetService) {}

  @Get()
  findAll() {
    return this.presetService.findAllAdmin();
  }

  @Post()
  create(@Body() dto: CreateAiPromptPresetDto) {
    return this.presetService.create(dto);
  }

  @Patch('reorder')
  reorder(@Body() dto: ReorderAiPromptPresetsDto) {
    return this.presetService.reorder(dto.orderedIds);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAiPromptPresetDto,
  ) {
    return this.presetService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.presetService.remove(id);
  }
}
