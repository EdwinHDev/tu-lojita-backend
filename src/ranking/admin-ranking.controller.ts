import {
  Controller,
  Get,
  Put,
  Post,
  Delete,
  Param,
  Query,
  Body,
  ParseUUIDPipe,
} from '@nestjs/common';
import { Auth } from 'src/auth/decorators/auth.decorator';
import { UserRole } from 'src/user/types/user-role.enum';
import { RankingService } from './services/ranking.service';
import { RankingSettingsService } from './services/ranking-settings.service';
import { AchievementService } from './services/achievement.service';
import { AchievementDefinition } from './entities/achievement-definition.entity';
import { Division, RankingSettingsData } from './types';

@Auth(UserRole.ADMIN)
@Controller('admin')
export class AdminRankingController {
  constructor(
    private readonly rankingService: RankingService,
    private readonly settingsService: RankingSettingsService,
    private readonly achievementService: AchievementService,
  ) {}

  // 6.5 Obtener configuración global
  @Get('ranking/settings')
  getSettings() {
    return this.settingsService.getSettings();
  }

  // 6.6 Actualizar configuración global
  @Put('ranking/settings')
  updateSettings(@Body() dto: Partial<RankingSettingsData>) {
    return this.settingsService.updateSettings(dto);
  }

  // 6.7 Auditoría de eventos LP con filtros
  @Get('ranking/events')
  getEvents(
    @Query('storeId') storeId?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '50',
  ) {
    return this.rankingService.getAdminEvents(
      storeId,
      parseInt(page, 10) || 1,
      parseInt(limit, 10) || 50,
    );
  }

  // 6.8 Anular un evento LP y recalcular LP de la tienda
  @Post('ranking/events/:eventId/void')
  voidEvent(@Param('eventId', ParseUUIDPipe) eventId: string) {
    return this.rankingService.voidEvent(eventId);
  }

  // 6.9 Ajuste manual de LP (con razón registrada)
  @Post('ranking/stores/:storeId/adjust')
  adjustLP(
    @Param('storeId', ParseUUIDPipe) storeId: string,
    @Body('lpDelta') lpDelta: number,
    @Body('reason') reason: string,
  ) {
    return this.rankingService.adjustStoreLP(
      storeId,
      Number(lpDelta),
      reason || 'Ajuste administrativo',
    );
  }

  // 6.10 Quitar flag de revisión
  @Post('ranking/stores/:storeId/unflag')
  unflagStore(@Param('storeId', ParseUUIDPipe) storeId: string) {
    return this.rankingService.unflagStore(storeId);
  }

  // 6.11 Listado de tiendas flagueadas con métricas
  @Get('ranking/flagged')
  getFlaggedStores(@Query('page') page = '1', @Query('limit') limit = '20') {
    return this.rankingService.getFlaggedStores(
      parseInt(page, 10) || 1,
      parseInt(limit, 10) || 20,
    );
  }

  // 7.4 Reemplazar imagen de emblema de división desde admin
  @Put('ranking/emblems/:division')
  updateEmblem(
    @Param('division') division: Division,
    @Body('imageUrl') imageUrl: string,
  ) {
    return this.settingsService.updateDivisionEmblem(division, imageUrl);
  }

  // 6.12 Listar definiciones de logros
  @Get('achievements')
  getAchievements() {
    return this.achievementService.findAllDefinitions();
  }

  // 6.13 Crear nuevo logro
  @Post('achievements')
  createAchievement(@Body() dto: Partial<AchievementDefinition>) {
    return this.achievementService.createDefinition(dto);
  }

  // 6.14 Editar logro
  @Put('achievements/:id')
  updateAchievement(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: Partial<AchievementDefinition>,
  ) {
    return this.achievementService.updateDefinition(id, dto);
  }

  // 6.15 Desactivar logro
  @Delete('achievements/:id')
  deleteAchievement(@Param('id', ParseUUIDPipe) id: string) {
    return this.achievementService.deleteDefinition(id);
  }
}
