import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan, LessThanOrEqual } from 'typeorm';
import { Store } from 'src/store/entities/store.entity';
import { StoreStatus } from 'src/store/types/status.enum';
import { Order } from 'src/order/entities/order.entity';
import { OrderStatus } from 'src/order/types/order-status.enum';
import { StoreRanking } from '../entities/store-ranking.entity';
import { RankingEvent } from '../entities/ranking-event.entity';
import { RankingService, DIVISION_ORDER } from './ranking.service';
import { RankingSettingsService } from './ranking-settings.service';
import { AchievementService } from './achievement.service';
import { NotificationService } from 'src/notification/notification.service';
import { NotificationType } from 'src/notification/entities/notification.entity';
import {
  Division,
  DIVISION_TITLES,
  normalizeDivision,
  RankingEventType,
  DEFAULT_RANKING_SETTINGS,
} from '../types';

@Injectable()
export class RankingCronService {
  private readonly logger = new Logger(RankingCronService.name);

  constructor(
    @InjectRepository(Store)
    private readonly storeRepo: Repository<Store>,
    @InjectRepository(StoreRanking)
    private readonly storeRankingRepo: Repository<StoreRanking>,
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    @InjectRepository(RankingEvent)
    private readonly rankingEventRepo: Repository<RankingEvent>,
    private readonly rankingService: RankingService,
    private readonly settingsService: RankingSettingsService,
    private readonly achievementService: AchievementService,
    private readonly notificationService: NotificationService,
  ) {}

  // Cron diario a las 20:00 VET: Advertencias de racha y zona de peligro
  @Cron('0 20 * * *', { timeZone: 'America/Caracas' })
  async handleDailyUrgencyWarnings() {
    this.logger.log(
      'Iniciando cron diario de avisos de urgencia (20:00 VET)...',
    );
    const activeRankings = await this.storeRankingRepo.find({
      relations: ['store', 'store.owner'],
    });

    const now = new Date();
    const todayYear = now.getFullYear();
    const todayMonth = now.getMonth();
    const todayDate = now.getDate();
    const settings = await this.settingsService.getSettings();
    const retConfig = settings.retention || DEFAULT_RANKING_SETTINGS.retention;

    for (const r of activeRankings) {
      if (!r.store?.owner?.id) continue;

      // 1. Advertencia de Racha en Llamas
      if (r.consecutiveSalesDays >= (retConfig.streakL1Days ?? 3)) {
        let soldToday = false;
        if (r.lastSaleDate) {
          const lsd = new Date(r.lastSaleDate);
          soldToday =
            lsd.getFullYear() === todayYear &&
            lsd.getMonth() === todayMonth &&
            lsd.getDate() === todayDate;
        }

        if (!soldToday) {
          await this.notificationService.create({
            userId: r.store.owner.id,
            storeId: r.storeId,
            type: NotificationType.STREAK_EXPIRING,
            title: '¡Tu Racha en Llamas está por apagarse! 🔥',
            body: `Tienes una racha de ${r.consecutiveSalesDays} días consecutivos de ventas. Si no concretas una venta antes de medianoche, tu racha volverá a cero.`,
            targetId: r.storeId,
          });
        }
      }

      // 2. Advertencia de Zona de Peligro
      if (r.inDangerZone && r.dangerZoneExpiresAt) {
        await this.notificationService.create({
          userId: r.store.owner.id,
          storeId: r.storeId,
          type: NotificationType.DANGER_ZONE_ALERT,
          title: '¡Peligro de Descenso Inminente! 🚨',
          body: `Tu tienda está en Zona de Peligro en el rango ${DIVISION_TITLES[normalizeDivision(r.division)]}. Concreta ventas hoy para evitar el descenso de Rango.`,
          targetId: r.storeId,
        });
      }
    }
  }

  // Cron diario a las 00:05 VET: Evaluación de rachas, escudos, peligro y decay élite
  @Cron('5 0 * * *', { timeZone: 'America/Caracas' })
  async handleDailyMidnightGamification() {
    this.logger.log(
      'Iniciando cron diario de medianoche para gamificación (00:05 VET)...',
    );
    const rankings = await this.storeRankingRepo.find({
      relations: ['store', 'store.owner'],
    });

    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const yYear = yesterday.getFullYear();
    const yMonth = yesterday.getMonth();
    const yDate = yesterday.getDate();

    for (const r of rankings) {
      try {
        let changed = false;

        // 1. Evaluar si la racha expiró ayer
        if (r.consecutiveSalesDays > 0 && r.lastSaleDate) {
          const lsd = new Date(r.lastSaleDate);
          const wasSoldYesterdayOrToday =
            (lsd.getFullYear() === yYear &&
              lsd.getMonth() === yMonth &&
              lsd.getDate() === yDate) ||
            (lsd.getFullYear() === now.getFullYear() &&
              lsd.getMonth() === now.getMonth() &&
              lsd.getDate() === now.getDate());

          if (!wasSoldYesterdayOrToday) {
            r.consecutiveSalesDays = 0;
            changed = true;
          }
        }

        // 2. Evaluar expiración del Escudo de Rango
        if (r.rankShieldExpiresAt && new Date(r.rankShieldExpiresAt) <= now) {
          r.rankShieldExpiresAt = undefined;
          changed = true;
        }

        // 3. Evaluar Zona de Peligro expirada -> Democión de Rango
        if (
          r.inDangerZone &&
          r.dangerZoneExpiresAt &&
          new Date(r.dangerZoneExpiresAt) <= now &&
          r.currentLP <= 0
        ) {
          const normDiv = normalizeDivision(r.division);
          const currentIdx = DIVISION_ORDER.indexOf(normDiv);
          if (currentIdx > 0) {
            const lowerDiv = DIVISION_ORDER[currentIdx - 1];
            r.division = lowerDiv;
            r.inDangerZone = false;
            r.dangerZoneExpiresAt = undefined;
            changed = true;

            if (r.store?.owner?.id) {
              await this.notificationService.create({
                userId: r.store.owner.id,
                storeId: r.storeId,
                type: NotificationType.DIVISION_DOWN,
                title: 'Descenso de Rango Confirmado ⚠️',
                body: `Tu tienda ha descendido a ${DIVISION_TITLES[lowerDiv]}. ¡Sube de nivel completando ventas y misiones diarias!`,
                targetId: r.storeId,
              });
            }
          }
        }

        // 4. Inactividad / Decay para la élite (Gran Distribuidor, Imperio Comercial, Magnate del Mercado)
        const eliteTiers = [
          Division.GRAN_DISTRIBUIDOR,
          Division.IMPERIO_COMERCIAL,
          Division.MAGNATE_MERCADO,
        ];
        const currentNormDiv = normalizeDivision(r.division);
        if (eliteTiers.includes(currentNormDiv)) {
          const settings = await this.settingsService.getSettings();
          const ret = settings.retention || DEFAULT_RANKING_SETTINGS.retention;
          const decayDays = ret.eliteDecayDays ?? 5;
          const decayPenalty = ret.eliteDecayPenalty ?? 10;
          const decayDate = new Date(now.getTime() - decayDays * 24 * 60 * 60 * 1000);

          const recentOrder = await this.orderRepo.findOne({
            where: {
              store: { id: r.storeId },
              status: OrderStatus.FULLY_PAID,
              createdAt: MoreThan(decayDate),
            },
          });

          if (!recentOrder) {
            // Deduct dynamic PR due to decay
            await this.rankingService.processEvent(
              r.storeId,
              RankingEventType.INACTIVITY_WEEKLY,
              undefined,
              undefined,
              -Math.abs(decayPenalty),
              { eliteDecay: true, daysInactive: decayDays },
            );
          }
        }

        if (changed) {
          await this.storeRankingRepo.save(r);
        }
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        this.logger.error(
          `Error running daily gamification for store ${r.storeId}: ${errorMsg}`,
        );
      }
    }
    this.logger.log('Cron diario de medianoche finalizado.');
  }

  // Cron semanal los lunes a las 00:00 (America/Caracas): Penalizaciones semanales por deuda
  @Cron('0 0 * * 1', { timeZone: 'America/Caracas' })
  async handleWeeklyRankingPenalties() {
    this.logger.log(
      'Iniciando cron semanal de penalizaciones de ranking (Lunes 00:00 VET)...',
    );
    const activeStores = await this.storeRepo.find({
      where: { status: StoreStatus.ACTIVE },
      relations: ['owner'],
    });

    for (const store of activeStores) {
      try {
        if (Number(store.accumulatedCommissionDebt) > 0) {
          await this.rankingService.processEvent(
            store.id,
            RankingEventType.SUBSCRIPTION_DEBT_WEEKLY,
            undefined,
            undefined,
            undefined,
            { debt: store.accumulatedCommissionDebt },
          );
        }
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        this.logger.error(
          `Error running weekly ranking penalty for store ${store.id}: ${errorMsg}`,
        );
      }
    }
    this.logger.log('Cron semanal de penalizaciones finalizado.');
  }

  // Cron nocturno a las 03:00 VET: Evaluación de logros basados en tiempo
  @Cron('0 3 * * *', { timeZone: 'America/Caracas' })
  async handleNightlyTimeAchievements() {
    this.logger.log(
      'Iniciando cron nocturno de evaluación de logros (03:00 VET)...',
    );
    const activeStores = await this.storeRepo.find({
      where: { status: StoreStatus.ACTIVE },
      select: ['id'],
    });

    for (const store of activeStores) {
      try {
        await this.achievementService.evaluate(store.id);
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        this.logger.error(
          `Error evaluating nightly achievements for store ${store.id}: ${errorMsg}`,
        );
      }
    }
    this.logger.log('Cron nocturno de logros finalizado.');
  }

  // Cron semanal (Domingo 20:00 VET): Resumen de PR semanal a comerciantes
  @Cron('0 20 * * 0', { timeZone: 'America/Caracas' })
  async handleWeeklySummaryNotifications() {
    this.logger.log(
      'Iniciando cron de resumen semanal de PR (Domingo 20:00 VET)...',
    );
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const activeStores = await this.storeRepo.find({
      where: { status: StoreStatus.ACTIVE },
      relations: ['owner'],
    });

    for (const store of activeStores) {
      if (!store.owner?.id) continue;

      try {
        const events = await this.rankingEventRepo.find({
          where: {
            storeId: store.id,
            isVoided: false,
            createdAt: MoreThan(oneWeekAgo),
          },
        });

        if (events.length === 0) continue;

        const weeklyPR = events.reduce((sum, e) => sum + e.lpDelta, 0);
        const ranking = await this.rankingService.getOrCreateStoreRanking(
          store.id,
        );
        const normDiv = normalizeDivision(ranking.division);

        await this.notificationService.create({
          userId: store.owner.id,
          storeId: store.id,
          type: NotificationType.WEEKLY_RANKING_SUMMARY,
          title: 'Resumen Semanal de Rendimiento 📊',
          body: `Esta semana sumaste ${weeklyPR >= 0 ? `+${weeklyPR}` : weeklyPR} PR. Tu rango actual es ${DIVISION_TITLES[normDiv]} (${ranking.currentLP} PR).`,
          targetId: store.id,
        });
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        this.logger.error(
          `Error sending weekly PR summary for store ${store.id}: ${errorMsg}`,
        );
      }
    }
    this.logger.log('Cron de resumen semanal finalizado.');
  }
}
