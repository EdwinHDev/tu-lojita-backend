import {
  Injectable,
  Logger,
  Inject,
  forwardRef,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StoreRanking } from '../entities/store-ranking.entity';
import { RankingEvent } from '../entities/ranking-event.entity';
import { Store } from 'src/store/entities/store.entity';
import { User } from 'src/user/entities/user.entity';
import { RankingSettingsService } from './ranking-settings.service';
import { AchievementService } from './achievement.service';
import { NotificationService } from 'src/notification/notification.service';
import { NotificationType } from 'src/notification/entities/notification.entity';
import {
  Division,
  DIVISION_TITLES,
  normalizeDivision,
  RankingEventType,
  RankingSettingsData,
  DEFAULT_RANKING_SETTINGS,
} from '../types';

export const DIVISION_ORDER: Division[] = [
  Division.PUESTO_AMBULANTE,
  Division.CARRITO_VENTAS,
  Division.TIENDITA_BARRIO,
  Division.LOCAL_ESTABLECIDO,
  Division.TIENDA_MARCA,
  Division.GRAN_DISTRIBUIDOR,
  Division.IMPERIO_COMERCIAL,
  Division.MAGNATE_MERCADO,
];

export interface DailyMission {
  id: string;
  code: string;
  title: string;
  description: string;
  prReward: number;
  targetCount: number;
  currentCount: number;
  isCompleted: boolean;
  isClaimed: boolean;
  badgeUrl: string;
}

@Injectable()
export class RankingService {
  private readonly logger = new Logger(RankingService.name);

  constructor(
    @InjectRepository(StoreRanking)
    private readonly storeRankingRepo: Repository<StoreRanking>,
    @InjectRepository(RankingEvent)
    private readonly rankingEventRepo: Repository<RankingEvent>,
    @InjectRepository(Store)
    private readonly storeRepo: Repository<Store>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly settingsService: RankingSettingsService,
    @Inject(forwardRef(() => AchievementService))
    private readonly achievementService: AchievementService,
    @Inject(forwardRef(() => NotificationService))
    private readonly notificationService: NotificationService,
  ) {}

  async getOrCreateStoreRanking(storeId: string): Promise<StoreRanking> {
    let ranking = await this.storeRankingRepo.findOne({
      where: { storeId },
      relations: ['store'],
    });

    if (!ranking) {
      ranking = this.storeRankingRepo.create({
        storeId,
        currentLP: 0,
        division: Division.PUESTO_AMBULANTE,
        isCalibrating: true,
        calibrationOrdersCompleted: 0,
        isFlagged: false,
        lastActivityDate: new Date(),
        consecutiveSalesDays: 0,
        inDangerZone: false,
      });
      ranking = await this.storeRankingRepo.save(ranking);
    } else {
      // Normalize legacy division values
      const normalized = normalizeDivision(ranking.division);
      if (ranking.division !== normalized) {
        ranking.division = normalized;
        await this.storeRankingRepo.save(ranking);
      }
    }

    return ranking;
  }

  async processEvent(
    storeId: string,
    eventType: RankingEventType,
    referenceId?: string,
    buyerAccountId?: string,
    customDelta?: number,
    metadata?: Record<string, any>,
  ): Promise<{ ranking: StoreRanking; event: RankingEvent }> {
    const storeRanking = await this.getOrCreateStoreRanking(storeId);
    const store = await this.storeRepo.findOne({
      where: { id: storeId },
      relations: ['owner', 'subcategory'],
    });

    if (!store) {
      throw new NotFoundException(`Store ${storeId} not found`);
    }

    const settings = await this.settingsService.getSettings();
    let antiCheatBlocked = false;
    let antiCheatReason: string | null = null;

    // Positive buyer-generated events: anti-cheat applies
    const isPositiveBuyerEvent =
      eventType === RankingEventType.ORDER_COMPLETED ||
      eventType === RankingEventType.REVIEW_5_STAR ||
      eventType === RankingEventType.REVIEW_4_STAR;

    if (isPositiveBuyerEvent && buyerAccountId) {
      const buyer = await this.userRepo.findOne({
        where: { id: buyerAccountId },
      });

      if (buyer) {
        const now = Date.now();
        const buyerAgeDays =
          (now - new Date(buyer.createdAt).getTime()) / (1000 * 60 * 60 * 24);

        if (buyerAgeDays < settings.antiCheat.accountMinAgeDays) {
          antiCheatBlocked = true;
          antiCheatReason = `Buyer account age (${buyerAgeDays.toFixed(1)} days) is less than required (${settings.antiCheat.accountMinAgeDays} days)`;
        }

        if (!antiCheatBlocked) {
          const cooldownDate = new Date(
            now - settings.antiCheat.buyerCooldownDays * 24 * 60 * 60 * 1000,
          );
          const recentEvent = await this.rankingEventRepo
            .createQueryBuilder('e')
            .where('e.storeId = :storeId', { storeId })
            .andWhere('e.buyerAccountId = :buyerAccountId', { buyerAccountId })
            .andWhere('e.isVoided = false')
            .andWhere('e.antiCheatBlocked = false')
            .andWhere('e.createdAt >= :cooldownDate', { cooldownDate })
            .getOne();

          if (recentEvent) {
            antiCheatBlocked = true;
            antiCheatReason = `Buyer cooldown in effect (last event: ${recentEvent.createdAt.toISOString()})`;
          }
        }

        if (!antiCheatBlocked && store.createdAt) {
          const daysFromStoreCreation =
            Math.abs(
              new Date(buyer.createdAt).getTime() -
                new Date(store.createdAt).getTime(),
            ) /
            (1000 * 60 * 60 * 24);

          if (
            daysFromStoreCreation <= settings.antiCheat.storeCreationWindowDays
          ) {
            antiCheatBlocked = true;
            antiCheatReason = `Buyer account created within ${daysFromStoreCreation.toFixed(1)} days of store creation (limit: ${settings.antiCheat.storeCreationWindowDays} days)`;
          }
        }
      }
    }

    // Check one-time profile complete bonus
    if (eventType === RankingEventType.PROFILE_COMPLETE) {
      const existing = await this.rankingEventRepo.findOne({
        where: {
          storeId,
          eventType: RankingEventType.PROFILE_COMPLETE,
          isVoided: false,
        },
      });
      if (existing) {
        customDelta = 0;
      }
    }

    // Daily Sales Streak ("Comercio en Llamas") logic
    let streakMultiplier = 1.0;
    if (eventType === RankingEventType.ORDER_COMPLETED && !antiCheatBlocked) {
      const now = new Date();
      if (storeRanking.lastSaleDate) {
        const lastSale = new Date(storeRanking.lastSaleDate);
        const isSameDay =
          now.getFullYear() === lastSale.getFullYear() &&
          now.getMonth() === lastSale.getMonth() &&
          now.getDate() === lastSale.getDate();

        if (!isSameDay) {
          const yesterday = new Date(now);
          yesterday.setDate(now.getDate() - 1);
          const isYesterday =
            yesterday.getFullYear() === lastSale.getFullYear() &&
            yesterday.getMonth() === lastSale.getMonth() &&
            yesterday.getDate() === lastSale.getDate();

          if (isYesterday) {
            storeRanking.consecutiveSalesDays =
              (storeRanking.consecutiveSalesDays || 0) + 1;
          } else {
            storeRanking.consecutiveSalesDays = 1;
          }
        }
      } else {
        storeRanking.consecutiveSalesDays = 1;
      }
      storeRanking.lastSaleDate = now;

      // Multiplier bonus based on streak days from dynamic retention settings
      const ret = settings.retention || DEFAULT_RANKING_SETTINGS.retention;
      if (storeRanking.consecutiveSalesDays >= (ret.streakL3Days ?? 15)) {
        streakMultiplier = ret.streakL3Multiplier ?? 1.5;
      } else if (storeRanking.consecutiveSalesDays >= (ret.streakL2Days ?? 7)) {
        streakMultiplier = ret.streakL2Multiplier ?? 1.25;
      } else if (storeRanking.consecutiveSalesDays >= (ret.streakL1Days ?? 3)) {
        streakMultiplier = ret.streakL1Multiplier ?? 1.1;
      }
    }

    // Calculate LP / PR Delta
    let lpDelta = 0;
    if (antiCheatBlocked) {
      lpDelta = 0;
    } else if (customDelta !== undefined) {
      lpDelta = customDelta;
    } else {
      const baseDelta: number =
        (settings.lpValues as unknown as Record<string, number>)[eventType] ??
        0;

      if (eventType === RankingEventType.ORDER_COMPLETED && baseDelta > 0) {
        let delta = baseDelta;
        if (storeRanking.isCalibrating) {
          delta = Math.round(delta * settings.calibration.lpMultiplier);
          storeRanking.calibrationOrdersCompleted += 1;
          if (
            storeRanking.calibrationOrdersCompleted >=
            settings.calibration.ordersRequired
          ) {
            storeRanking.isCalibrating = false;
          }
        }
        lpDelta = Math.round(delta * streakMultiplier);
      } else {
        lpDelta = baseDelta;
      }
    }

    // Persist RankingEvent
    const event = this.rankingEventRepo.create({
      storeId,
      eventType,
      lpDelta,
      referenceId,
      buyerAccountId,
      isVoided: false,
      antiCheatBlocked,
      metadata: {
        ...(metadata || {}),
        streakMultiplier: streakMultiplier > 1 ? streakMultiplier : undefined,
        consecutiveSalesDays: storeRanking.consecutiveSalesDays,
        ...(antiCheatReason ? { antiCheatReason } : {}),
      },
    });
    const savedEvent = await this.rankingEventRepo.save(event);

    // Update StoreRanking currentLP (PR)
    const oldLP = storeRanking.currentLP;
    const oldDivision = normalizeDivision(storeRanking.division);
    const newLP = Math.max(0, oldLP + lpDelta);

    storeRanking.currentLP = newLP;
    storeRanking.lastActivityDate = new Date();

    // Recover from Danger Zone if positive delta earned
    if (lpDelta > 0 && storeRanking.inDangerZone) {
      storeRanking.inDangerZone = false;
      storeRanking.dangerZoneExpiresAt = undefined;
    }

    // Calculate New Division with Escudo de Rango protection
    const newDivision = await this.calculateDivision(
      storeId,
      newLP,
      settings,
      oldDivision,
      storeRanking.rankShieldExpiresAt,
    );
    storeRanking.division = newDivision;

    // Check if store enters Danger Zone (0 PR at current tier while unshielded)
    if (newLP === 0 && !storeRanking.inDangerZone) {
      const isShieldActive =
        storeRanking.rankShieldExpiresAt &&
        new Date(storeRanking.rankShieldExpiresAt) > new Date();
      if (!isShieldActive && newDivision !== Division.PUESTO_AMBULANTE) {
        const dangerHours =
          settings.retention?.dangerZoneHours ||
          DEFAULT_RANKING_SETTINGS.retention.dangerZoneHours ||
          24;
        storeRanking.inDangerZone = true;
        storeRanking.dangerZoneExpiresAt = new Date(
          Date.now() + dangerHours * 60 * 60 * 1000,
        );

        if (store.owner?.id) {
          await this.notificationService.create({
            userId: store.owner.id,
            storeId: store.id,
            type: NotificationType.DANGER_ZONE_ALERT,
            title: '¡Zona de Peligro! 🚨',
            body: `Tu tienda ha llegado a 0 PR en ${DIVISION_TITLES[newDivision]}. Tienes 24 horas para sumar puntos antes de descender de Rango.`,
            targetId: store.id,
          });
        }
      }
    }

    await this.storeRankingRepo.save(storeRanking);

    // Division change notification & Escudo de Rango grant
    if (oldDivision !== newDivision) {
      await this.handleDivisionChange(
        store,
        storeRanking,
        oldDivision,
        newDivision,
        settings,
      );
    }

    // Check category rivalry triggers
    if (lpDelta > 0 && store.subcategory?.id) {
      this.checkCategoryRivalry(store, oldLP, newLP).catch((err) => {
        this.logger.error(`Error checking category rivalry: ${err.message}`);
      });
    }

    // Trigger achievement evaluation
    try {
      await this.achievementService.evaluate(storeId);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Error evaluating achievements for store ${storeId}: ${errorMsg}`,
      );
    }

    return { ranking: storeRanking, event: savedEvent };
  }

  private async calculateDivision(
    storeId: string,
    lp: number,
    settings: RankingSettingsData,
    currentDivision?: Division,
    rankShieldExpiresAt?: Date,
  ): Promise<Division> {
    const thresholds = settings.divisionThresholds;
    const thresholdImperio = thresholds.IMPERIO_COMERCIAL ?? 3400;
    const thresholdDistribuidor = thresholds.GRAN_DISTRIBUIDOR ?? 2600;
    const thresholdMarca = thresholds.TIENDA_MARCA ?? 1900;
    const thresholdLocal = thresholds.LOCAL_ESTABLECIDO ?? 1300;
    const thresholdBarrio = thresholds.TIENDITA_BARRIO ?? 800;
    const thresholdCarrito = thresholds.CARRITO_VENTAS ?? 400;

    let targetDivision: Division = Division.PUESTO_AMBULANTE;

    if (lp >= thresholdImperio) {
      const maxMagnateStores = settings.maestro?.maxStores || 50;
      const topStores = await this.storeRankingRepo.find({
        order: { currentLP: 'DESC' },
        take: maxMagnateStores,
      });

      const isStoreInTopN = topStores.some((s) => s.storeId === storeId);
      const isTopNFull = topStores.length >= maxMagnateStores;
      const lowestMagnateLP = isTopNFull
        ? topStores[topStores.length - 1].currentLP
        : 0;

      if (!isTopNFull || isStoreInTopN || lp >= lowestMagnateLP) {
        targetDivision = Division.MAGNATE_MERCADO;
      } else {
        targetDivision = Division.IMPERIO_COMERCIAL;
      }
    } else if (lp >= thresholdDistribuidor) {
      targetDivision = Division.GRAN_DISTRIBUIDOR;
    } else if (lp >= thresholdMarca) {
      targetDivision = Division.TIENDA_MARCA;
    } else if (lp >= thresholdLocal) {
      targetDivision = Division.LOCAL_ESTABLECIDO;
    } else if (lp >= thresholdBarrio) {
      targetDivision = Division.TIENDITA_BARRIO;
    } else if (lp >= thresholdCarrito) {
      targetDivision = Division.CARRITO_VENTAS;
    } else {
      targetDivision = Division.PUESTO_AMBULANTE;
    }

    // Demotion check with Escudo de Rango
    if (currentDivision) {
      const currentIdx = DIVISION_ORDER.indexOf(
        normalizeDivision(currentDivision),
      );
      const targetIdx = DIVISION_ORDER.indexOf(targetDivision);

      if (targetIdx < currentIdx) {
        // Demotion attempted: check if shield is active
        const isShieldActive =
          rankShieldExpiresAt && new Date(rankShieldExpiresAt) > new Date();
        if (isShieldActive) {
          // Escudo de Rango prevents downward demotion!
          return normalizeDivision(currentDivision);
        }
      }
    }

    return targetDivision;
  }

  private async handleDivisionChange(
    store: Store,
    storeRanking: StoreRanking,
    oldDivision: Division,
    newDivision: Division,
    settings?: RankingSettingsData,
  ) {
    const oldNorm = normalizeDivision(oldDivision);
    const newNorm = normalizeDivision(newDivision);
    const oldIndex = DIVISION_ORDER.indexOf(oldNorm);
    const newIndex = DIVISION_ORDER.indexOf(newNorm);

    if (newIndex > oldIndex) {
      // PROMOTION: Grant Escudo de Rango from dynamic configuration
      const shieldHours =
        settings?.retention?.rankShieldHours ||
        DEFAULT_RANKING_SETTINGS.retention.rankShieldHours ||
        48;
      storeRanking.rankShieldExpiresAt = new Date(
        Date.now() + shieldHours * 60 * 60 * 1000,
      );
      storeRanking.inDangerZone = false;
      storeRanking.dangerZoneExpiresAt = undefined;
      await this.storeRankingRepo.save(storeRanking);

      if (store.owner?.id) {
        await this.notificationService.create({
          userId: store.owner.id,
          storeId: store.id,
          type: NotificationType.DIVISION_UP,
          title: '¡Ascenso de Rango! 🚀',
          body: `¡Felicidades! Tu tienda ha ascendido al rango ${DIVISION_TITLES[newNorm]}. PR actual: ${storeRanking.currentLP}. ¡Tu Escudo de Rango de ${shieldHours} horas está activo!`,
          targetId: store.id,
        });
      }
    } else if (newIndex < oldIndex) {
      // DEMOTION
      storeRanking.inDangerZone = false;
      storeRanking.dangerZoneExpiresAt = undefined;
      await this.storeRankingRepo.save(storeRanking);

      if (store.owner?.id) {
        await this.notificationService.create({
          userId: store.owner.id,
          storeId: store.id,
          type: NotificationType.DIVISION_DOWN,
          title: 'Descenso de Rango ⚠️',
          body: `Tu tienda ha descendido al rango ${DIVISION_TITLES[newNorm]}. Concreta ventas y atiende a tus clientes para recuperar tu Rango.`,
          targetId: store.id,
        });
      }
    }
  }

  private async checkCategoryRivalry(
    store: Store,
    oldLP: number,
    newLP: number,
  ) {
    if (!store.subcategory?.id) return;

    // Find rival stores in same subcategory that this store just passed
    const rivalsOvertaken = await this.storeRankingRepo
      .createQueryBuilder('sr')
      .innerJoin('sr.store', 's')
      .innerJoinAndSelect('s.owner', 'owner')
      .where('s.subcategoryId = :subId', { subId: store.subcategory.id })
      .andWhere('sr.storeId != :storeId', { storeId: store.id })
      .andWhere('sr.currentLP >= :oldLP AND sr.currentLP < :newLP', {
        oldLP,
        newLP,
      })
      .getMany();

    for (const rival of rivalsOvertaken) {
      if (rival.store?.owner?.id) {
        await this.notificationService.create({
          userId: rival.store.owner.id,
          storeId: rival.storeId,
          type: NotificationType.CATEGORY_RIVALRY,
          title: '¡Alerta de Rival Comercial! 🔥',
          body: `La tienda "${store.name}" te ha superado en Puntos de Rango en tu categoría. ¡Concreta ventas hoy para recuperar tu puesto!`,
          targetId: store.id,
        });
      }
    }
  }

  // Daily Merchant Missions Engine
  async getDailyMissions(storeId: string): Promise<DailyMission[]> {
    const ranking = await this.getOrCreateStoreRanking(storeId);
    const todayStr = new Date().toISOString().slice(0, 10);
    const lastDateStr = ranking.lastMissionDate
      ? new Date(ranking.lastMissionDate).toISOString().slice(0, 10)
      : '';

    // If day changed, reset claimed missions for the new day
    if (todayStr !== lastDateStr) {
      ranking.claimedMissionsToday = [];
      ranking.dailyMissionsCompletedToday = 0;
      ranking.lastMissionDate = new Date();
      await this.storeRankingRepo.save(ranking);
    }

    const claimed = ranking.claimedMissionsToday || [];

    // Count today's completed orders for this store
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const todayEvents = await this.rankingEventRepo
      .createQueryBuilder('e')
      .where('e.storeId = :storeId', { storeId })
      .andWhere('e.createdAt >= :startOfToday', { startOfToday })
      .andWhere('e.isVoided = false')
      .getMany();

    const ordersCount = todayEvents.filter(
      (e) => e.eventType === RankingEventType.ORDER_COMPLETED,
    ).length;
    const reviewsCount = todayEvents.filter(
      (e) => e.eventType === RankingEventType.REVIEW_5_STAR,
    ).length;

    const settings = await this.settingsService.getSettings();
    const mConfig = settings.missions || DEFAULT_RANKING_SETTINGS.missions;
    const volumeTarget = mConfig.volumeTargetOrders || 3;

    const missions: DailyMission[] = [
      {
        id: 'mission_1',
        code: 'VENTA_DEL_DIA',
        title: 'Primera Venta del Día',
        description: 'Concreta al menos 1 pedido hoy para mantener tu racha.',
        prReward: mConfig.dailySaleReward ?? 15,
        targetCount: 1,
        currentCount: Math.min(1, ordersCount),
        isCompleted: ordersCount >= 1,
        isClaimed: claimed.includes('VENTA_DEL_DIA'),
        badgeUrl:
          (mConfig as any)?.customBadges?.VENTA_DEL_DIA ||
          '/assets/ranking/achievements/first_step.png',
      },
      {
        id: 'mission_2',
        code: 'EXCELENCIA_5_ESTRELLAS',
        title: 'Calidad Impecable',
        description:
          'Recibe una reseña de 5 estrellas de un cliente satisfecho.',
        prReward: mConfig.review5StarReward ?? 25,
        targetCount: 1,
        currentCount: Math.min(1, reviewsCount),
        isCompleted: reviewsCount >= 1,
        isClaimed: claimed.includes('EXCELENCIA_5_ESTRELLAS'),
        badgeUrl:
          (mConfig as any)?.customBadges?.EXCELENCIA_5_ESTRELLAS ||
          '/assets/ranking/achievements/five_stars.png',
      },
      {
        id: 'mission_3',
        code: 'VOLUMEN_COMERCIAL',
        title: 'Impulso de Ventas',
        description: `Entrega ${volumeTarget} o más pedidos completados en el día.`,
        prReward: mConfig.volumeReward ?? 35,
        targetCount: volumeTarget,
        currentCount: Math.min(volumeTarget, ordersCount),
        isCompleted: ordersCount >= volumeTarget,
        isClaimed: claimed.includes('VOLUMEN_COMERCIAL'),
        badgeUrl:
          (mConfig as any)?.customBadges?.VOLUMEN_COMERCIAL ||
          '/assets/ranking/achievements/star_seller.png',
      },
    ];

    return missions;
  }

  async claimDailyMission(
    storeId: string,
    missionCode: string,
  ): Promise<{ mission: DailyMission; ranking: StoreRanking }> {
    const missions = await this.getDailyMissions(storeId);
    const mission = missions.find((m) => m.code === missionCode);

    if (!mission) {
      throw new NotFoundException(`Mission ${missionCode} not found`);
    }
    if (!mission.isCompleted) {
      throw new BadRequestException('Mission criteria not yet completed');
    }
    if (mission.isClaimed) {
      throw new BadRequestException('Mission already claimed today');
    }

    const ranking = await this.getOrCreateStoreRanking(storeId);
    const claimed = ranking.claimedMissionsToday || [];
    claimed.push(missionCode);
    ranking.claimedMissionsToday = claimed;
    ranking.dailyMissionsCompletedToday =
      (ranking.dailyMissionsCompletedToday || 0) + 1;
    await this.storeRankingRepo.save(ranking);

    // Award bonus PR via processEvent
    const { ranking: updatedRanking } = await this.processEvent(
      storeId,
      RankingEventType.ORDER_COMPLETED,
      undefined,
      undefined,
      mission.prReward,
      { missionCode, dailyMissionClaim: true },
    );

    mission.isClaimed = true;
    return { mission, ranking: updatedRanking };
  }

  // Public & Mobile API queries
  async getStoreRankingData(storeId: string) {
    const ranking = await this.getOrCreateStoreRanking(storeId);
    const settings = await this.settingsService.getSettings();
    const normDiv = normalizeDivision(ranking.division);
    const emblemKey =
      normDiv in settings.divisionEmblems ? normDiv : ranking.division;
    const emblemUrl =
      settings.divisionEmblems[emblemKey] ||
      `/uploads/emblems/${normDiv.toLowerCase()}.png`;

    // Calculate position in leaderboard
    const betterStoresCount = await this.storeRankingRepo
      .createQueryBuilder('sr')
      .where('sr.currentLP > :lp', { lp: ranking.currentLP })
      .getCount();
    const position = betterStoresCount + 1;

    // Calculate next tier milestone
    const currentIdx = DIVISION_ORDER.indexOf(normDiv);
    const nextDivision =
      currentIdx < DIVISION_ORDER.length - 1
        ? DIVISION_ORDER[currentIdx + 1]
        : null;
    const thresholds = settings.divisionThresholds;
    const nextThreshold = nextDivision
      ? (thresholds[nextDivision as unknown as keyof typeof thresholds] ?? 0)
      : null;
    const pointsToNextTier = nextThreshold
      ? Math.max(0, Number(nextThreshold) - ranking.currentLP)
      : 0;

    // Calculate current streak multiplier
    let streakMultiplier = 1.0;
    if (ranking.consecutiveSalesDays >= 15) {
      streakMultiplier = 1.5;
    } else if (ranking.consecutiveSalesDays >= 7) {
      streakMultiplier = 1.25;
    } else if (ranking.consecutiveSalesDays >= 3) {
      streakMultiplier = 1.1;
    }

    const isShieldActive = ranking.rankShieldExpiresAt
      ? new Date(ranking.rankShieldExpiresAt) > new Date()
      : false;

    // Fetch showcase achievements
    const showcase = await this.achievementService.getStoreShowcase(storeId);

    return {
      storeId,
      currentPR: ranking.currentLP,
      currentLP: ranking.currentLP, // Backward compatibility
      division: normDiv,
      divisionTitle: DIVISION_TITLES[normDiv] || normDiv,
      divisionEmblemUrl: emblemUrl,
      position,
      isCalibrating: ranking.isCalibrating,
      calibrationOrdersCompleted: ranking.calibrationOrdersCompleted,
      isFlagged: ranking.isFlagged,
      lastActivityDate: ranking.lastActivityDate,
      // Retention & Gamification properties
      rankShieldExpiresAt: ranking.rankShieldExpiresAt,
      isShieldActive,
      inDangerZone: ranking.inDangerZone,
      dangerZoneExpiresAt: ranking.dangerZoneExpiresAt,
      consecutiveSalesDays: ranking.consecutiveSalesDays || 0,
      streakMultiplier,
      nextDivision,
      nextDivisionTitle: nextDivision ? DIVISION_TITLES[nextDivision] : null,
      pointsToNextTier,
      nextTierThreshold: nextThreshold,
      showcase,
    };
  }

  async getStoreEvents(storeId: string, page = 1, limit = 20) {
    const [events, total] = await this.rankingEventRepo.findAndCount({
      where: { storeId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { events, total, page, limit };
  }

  async getLeaderboard(
    page = 1,
    limit = 50,
    subcategoryId?: string,
    categoryId?: string,
  ) {
    const query = this.storeRankingRepo
      .createQueryBuilder('sr')
      .innerJoinAndSelect('sr.store', 'store')
      .leftJoinAndSelect('store.subcategory', 'subcategory')
      .leftJoinAndSelect('subcategory.category', 'category')
      .where('store.status = :status', { status: 'ACTIVE' });

    const filterId = categoryId || subcategoryId;
    if (filterId) {
      query.andWhere(
        '(store.subcategoryId = :filterId OR subcategory.categoryId = :filterId)',
        { filterId },
      );
    }

    query
      .orderBy('sr.currentLP', 'DESC')
      .addOrderBy('sr.createdAt', 'ASC')
      .skip((page - 1) * limit)
      .take(limit);

    const [rankings, total] = await query.getManyAndCount();
    const settings = await this.settingsService.getSettings();

    const items = rankings.map((r, idx) => {
      const normDiv = normalizeDivision(r.division);
      const emblemKey =
        normDiv in settings.divisionEmblems ? normDiv : r.division;
      return {
        position: (page - 1) * limit + idx + 1,
        storeId: r.storeId,
        storeName: r.store?.name || '',
        storeLogo: r.store?.logo || '',
        division: normDiv,
        divisionTitle: DIVISION_TITLES[normDiv] || normDiv,
        divisionEmblemUrl:
          settings.divisionEmblems[emblemKey] ||
          `/uploads/emblems/${normDiv.toLowerCase()}.png`,
        currentPR: r.currentLP,
        currentLP: r.currentLP,
        consecutiveSalesDays: r.consecutiveSalesDays || 0,
        isCalibrating: r.isCalibrating,
        subcategoryName: r.store?.subcategory?.name || null,
      };
    });

    return { items, total, page, limit };
  }

  async getDivisionsInfo() {
    const settings = await this.settingsService.getSettings();
    return DIVISION_ORDER.map((div) => {
      const normDiv = normalizeDivision(div);
      const threshold =
        normDiv === Division.MAGNATE_MERCADO
          ? 'Top 50'
          : (settings.divisionThresholds[
              normDiv as unknown as keyof typeof settings.divisionThresholds
            ] ?? 0);
      const emblemUrl =
        settings.divisionEmblems[normDiv] ||
        `/uploads/emblems/${normDiv.toLowerCase()}.png`;

      return {
        division: normDiv,
        title: DIVISION_TITLES[normDiv] || normDiv,
        threshold,
        emblemUrl,
      };
    });
  }

  // Admin Actions
  async getFlaggedStores(page = 1, limit = 20) {
    const [rankings, total] = await this.storeRankingRepo.findAndCount({
      where: { isFlagged: true },
      relations: ['store', 'store.owner'],
      order: { updatedAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { rankings, total, page, limit };
  }

  async unflagStore(storeId: string): Promise<StoreRanking> {
    const ranking = await this.getOrCreateStoreRanking(storeId);
    ranking.isFlagged = false;
    return this.storeRankingRepo.save(ranking);
  }

  async adjustStoreLP(
    storeId: string,
    lpDelta: number,
    reason: string,
  ): Promise<{ ranking: StoreRanking; event: RankingEvent }> {
    return this.processEvent(
      storeId,
      RankingEventType.MANUAL_ADJUSTMENT,
      undefined,
      undefined,
      lpDelta,
      { reason, manualAdjustment: true },
    );
  }

  async voidEvent(eventId: string): Promise<StoreRanking> {
    const event = await this.rankingEventRepo.findOne({
      where: { id: eventId },
    });
    if (!event) throw new NotFoundException('Event not found');

    event.isVoided = true;
    await this.rankingEventRepo.save(event);

    const storeRanking = await this.getOrCreateStoreRanking(event.storeId);
    const nonVoidedEvents = await this.rankingEventRepo.find({
      where: {
        storeId: event.storeId,
        isVoided: false,
        antiCheatBlocked: false,
      },
    });

    const totalLP = nonVoidedEvents.reduce((sum, e) => sum + e.lpDelta, 0);
    const newLP = Math.max(0, totalLP);
    storeRanking.currentLP = newLP;

    const settings = await this.settingsService.getSettings();
    storeRanking.division = await this.calculateDivision(
      event.storeId,
      newLP,
      settings,
    );

    return this.storeRankingRepo.save(storeRanking);
  }

  async getAdminEvents(storeId?: string, page = 1, limit = 50) {
    const query = this.rankingEventRepo
      .createQueryBuilder('e')
      .innerJoinAndSelect('e.store', 'store')
      .orderBy('e.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (storeId) {
      query.andWhere('e.storeId = :storeId', { storeId });
    }

    const [events, total] = await query.getManyAndCount();
    return { events, total, page, limit };
  }
}
