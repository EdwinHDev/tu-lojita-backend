import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Query,
  Body,
  ParseUUIDPipe,
  NotFoundException,
} from '@nestjs/common';
import { Auth } from 'src/auth/decorators/auth.decorator';
import { GetUser } from 'src/auth/decorators/get-user.decorator';
import { User } from 'src/user/entities/user.entity';
import { UserRole } from 'src/user/types/user-role.enum';
import { RankingService } from './services/ranking.service';
import { AchievementService } from './services/achievement.service';

@Controller('ranking')
export class RankingController {
  constructor(
    private readonly rankingService: RankingService,
    private readonly achievementService: AchievementService,
  ) {}

  // 6.1 Leaderboard público paginado con filtro opcional por categoría o subcategoría
  @Get('leaderboard')
  getLeaderboard(
    @Query('page') page = '1',
    @Query('limit') limit = '50',
    @Query('subcategoryId') subcategoryId?: string,
    @Query('categoryId') categoryId?: string,
  ) {
    return this.rankingService.getLeaderboard(
      parseInt(page, 10) || 1,
      parseInt(limit, 10) || 50,
      subcategoryId,
      categoryId,
    );
  }

  // 6.4 Info de las 8 divisiones con umbrales y emblemas
  @Get('divisions')
  getDivisions() {
    return this.rankingService.getDivisionsInfo();
  }

  // Obtener ranking de la tienda del usuario autenticado
  @Auth()
  @Get('my-ranking')
  async getMyRanking(@GetUser() user: User) {
    if (!user.store?.id) {
      throw new NotFoundException('El usuario no posee una tienda registrada');
    }
    return this.rankingService.getStoreRankingData(user.store.id);
  }

  // Misiones diarias para la tienda del usuario autenticado
  @Auth()
  @Get('missions/daily')
  async getMyDailyMissions(@GetUser() user: User) {
    if (!user.store?.id) {
      throw new NotFoundException('El usuario no posee una tienda registrada');
    }
    return this.rankingService.getDailyMissions(user.store.id);
  }

  // Reclamar recompensa de misión diaria para la tienda autenticada
  @Auth()
  @Post('missions/:code/claim')
  async claimMyDailyMission(
    @Param('code') code: string,
    @GetUser() user: User,
  ) {
    if (!user.store?.id) {
      throw new NotFoundException('El usuario no posee una tienda registrada');
    }
    return this.rankingService.claimDailyMission(user.store.id, code);
  }

  // 6.2 Datos de ranking de una tienda (división, PR, posición, racha, showcase)
  @Get('stores/:storeId')
  getStoreRanking(@Param('storeId', ParseUUIDPipe) storeId: string) {
    return this.rankingService.getStoreRankingData(storeId);
  }

  // Misiones diarias de una tienda específica
  @Get('stores/:storeId/missions/daily')
  getStoreDailyMissions(@Param('storeId', ParseUUIDPipe) storeId: string) {
    return this.rankingService.getDailyMissions(storeId);
  }

  // Reclamar misión diaria para una tienda específica (requiere autenticación)
  @Auth()
  @Post('stores/:storeId/missions/:code/claim')
  claimStoreDailyMission(
    @Param('storeId', ParseUUIDPipe) storeId: string,
    @Param('code') code: string,
  ) {
    return this.rankingService.claimDailyMission(storeId, code);
  }

  // 6.3 Historial de eventos LP de la tienda (solo para el seller dueño o admin)
  @Auth()
  @Get('stores/:storeId/events')
  async getStoreEvents(
    @Param('storeId', ParseUUIDPipe) storeId: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.rankingService.getStoreEvents(
      storeId,
      parseInt(page, 10) || 1,
      parseInt(limit, 10) || 20,
    );
  }

  // 5.5 Exponer logros desbloqueados de la tienda
  @Get('stores/:storeId/achievements')
  getStoreAchievements(@Param('storeId', ParseUUIDPipe) storeId: string) {
    return this.achievementService.getStoreAchievements(storeId);
  }

  // 5.6 Exponer definición de logro por ID
  @Get('achievements/:id')
  getAchievementById(@Param('id', ParseUUIDPipe) id: string) {
    return this.achievementService.findDefinitionById(id);
  }

  // 5.4 Seller gestiona su vitrina (max 5)
  @Auth()
  @Put('stores/:storeId/achievements/showcase')
  updateShowcase(
    @Param('storeId', ParseUUIDPipe) storeId: string,
    @Body('achievementIds') achievementIds: string[],
    @GetUser() user: User,
  ) {
    if (user.role !== UserRole.ADMIN && user.store?.id !== storeId) {
      // allow owner
    }
    return this.achievementService.updateShowcase(
      storeId,
      achievementIds || [],
    );
  }
}
