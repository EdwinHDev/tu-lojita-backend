import {
  Injectable,
  Logger,
  Inject,
  forwardRef,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { AchievementDefinition } from '../entities/achievement-definition.entity';
import { StoreAchievementUnlock } from '../entities/store-achievement-unlock.entity';
import { StoreAchievementShowcase } from '../entities/store-achievement-showcase.entity';
import { StoreRanking } from '../entities/store-ranking.entity';
import { Store } from 'src/store/entities/store.entity';
import { Order } from 'src/order/entities/order.entity';
import { OrderStatus } from 'src/order/types/order-status.enum';
import { OrderReview } from 'src/review/entities/order-review.entity';
import { OrderDispute } from 'src/order-dispute/entities/order-dispute.entity';
import { NotificationService } from 'src/notification/notification.service';
import { NotificationType } from 'src/notification/entities/notification.entity';
import { RankingService } from './ranking.service';
import { AchievementTriggerType, RankingEventType } from '../types';

@Injectable()
export class AchievementService {
  private readonly logger = new Logger(AchievementService.name);

  constructor(
    @InjectRepository(AchievementDefinition)
    private readonly achievementRepo: Repository<AchievementDefinition>,
    @InjectRepository(StoreAchievementUnlock)
    private readonly unlockRepo: Repository<StoreAchievementUnlock>,
    @InjectRepository(StoreAchievementShowcase)
    private readonly showcaseRepo: Repository<StoreAchievementShowcase>,
    @InjectRepository(Store)
    private readonly storeRepo: Repository<Store>,
    @InjectRepository(StoreRanking)
    private readonly rankingRepo: Repository<StoreRanking>,
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    @InjectRepository(OrderReview)
    private readonly reviewRepo: Repository<OrderReview>,
    @InjectRepository(OrderDispute)
    private readonly disputeRepo: Repository<OrderDispute>,
    @Inject(forwardRef(() => RankingService))
    private readonly rankingService: RankingService,
    @Inject(forwardRef(() => NotificationService))
    private readonly notificationService: NotificationService,
  ) {}

  async evaluate(
    storeId: string,
    triggerType?: AchievementTriggerType,
  ): Promise<StoreAchievementUnlock[]> {
    const store = await this.storeRepo.findOne({ where: { id: storeId } });
    if (!store) return [];

    // Find unlocked achievements
    const existingUnlocks = await this.unlockRepo.find({
      where: { storeId },
      select: ['achievementId'],
    });
    const unlockedIds = new Set(existingUnlocks.map((u) => u.achievementId));

    // Find candidate achievements
    const query = this.achievementRepo
      .createQueryBuilder('a')
      .where('a.isActive = :isActive', { isActive: true });

    if (triggerType) {
      query.andWhere('a.triggerType = :triggerType', { triggerType });
    }

    const candidates = await query.getMany();
    const newlyUnlocked: StoreAchievementUnlock[] = [];

    for (const ach of candidates) {
      if (unlockedIds.has(ach.id)) continue;

      const met = await this.checkCondition(store, ach);
      if (met) {
        const unlock = await this.unlockAchievement(storeId, ach.id);
        if (unlock) newlyUnlocked.push(unlock);
      }
    }

    return newlyUnlocked;
  }

  private async checkCondition(
    store: Store,
    ach: AchievementDefinition,
  ): Promise<boolean> {
    const threshold = Number(ach.triggerThreshold);

    switch (ach.triggerType) {
      case AchievementTriggerType.ORDER_COUNT: {
        const count = await this.orderRepo.count({
          where: { store: { id: store.id }, status: OrderStatus.FULLY_PAID },
        });
        return count >= threshold;
      }

      case AchievementTriggerType.REVIEW_COUNT: {
        const count = await this.reviewRepo.count({
          where: { order: { store: { id: store.id } } },
        });
        return count >= threshold;
      }

      case AchievementTriggerType.REVIEW_5_STAR_COUNT: {
        const count = await this.reviewRepo.count({
          where: { order: { store: { id: store.id } }, rating: 5 },
        });
        return count >= threshold;
      }

      case AchievementTriggerType.PROFILE_COMPLETE: {
        const isComplete = Boolean(store.logo && store.description);
        return isComplete;
      }

      case AchievementTriggerType.NO_DISPUTES_DAYS: {
        // Last dispute date or store creation date
        const lastDispute = await this.disputeRepo.findOne({
          where: { order: { store: { id: store.id } } },
          order: { createdAt: 'DESC' },
        });

        const referenceDate = lastDispute
          ? lastDispute.createdAt
          : store.createdAt;
        const diffDays =
          (Date.now() - new Date(referenceDate).getTime()) /
          (1000 * 60 * 60 * 24);

        return diffDays >= threshold;
      }

      case AchievementTriggerType.STREAK_ORDERS: {
        // Streak of orders without cancellations
        const recentOrders = await this.orderRepo.find({
          where: { store: { id: store.id } },
          order: { createdAt: 'DESC' },
          take: threshold,
        });
        if (recentOrders.length < threshold) return false;
        return recentOrders.every((o) => o.status === OrderStatus.FULLY_PAID);
      }

      default:
        return false;
    }
  }

  async unlockAchievement(
    storeId: string,
    achievementId: string,
  ): Promise<StoreAchievementUnlock | null> {
    const existing = await this.unlockRepo.findOne({
      where: { storeId, achievementId },
    });
    if (existing) return existing;

    const achievement = await this.achievementRepo.findOne({
      where: { id: achievementId },
    });
    if (!achievement) return null;

    const unlock = this.unlockRepo.create({
      storeId,
      achievementId,
      unlockedAt: new Date(),
      lpBonusGranted: achievement.lpBonus,
    });
    const saved = await this.unlockRepo.save(unlock);

    // Grant LP bonus if any
    if (achievement.lpBonus > 0) {
      await this.rankingService.processEvent(
        storeId,
        RankingEventType.ACHIEVEMENT_BONUS,
        achievement.id,
        undefined,
        achievement.lpBonus,
        {
          achievementName: achievement.name,
          achievementCategory: achievement.category,
        },
      );
    }

    // Send push notification to seller
    try {
      const store = await this.storeRepo.findOne({
        where: { id: storeId },
        relations: ['owner'],
      });

      if (store?.owner?.id) {
        await this.notificationService.create({
          userId: store.owner.id,
          storeId: store.id,
          type: NotificationType.ACHIEVEMENT_UNLOCKED,
          title: '¡Logro Desbloqueado! 🏆',
          body: `Tu tienda ha obtenido el logro "${achievement.name}". ¡Ganaste +${achievement.lpBonus} LP!`,
          targetId: achievement.id,
        });
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Failed to send achievement unlock notification: ${errorMsg}`,
      );
    }

    return saved;
  }

  async getStoreAchievements(storeId: string) {
    // 1. Evaluate any pending criteria on-demand so recent milestones unlock immediately
    try {
      await this.evaluate(storeId);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Error auto-evaluating achievements for store ${storeId}: ${errorMsg}`,
      );
    }

    // 2. Fetch all active achievement definitions ordered by category and threshold
    const definitions = await this.achievementRepo.find({
      where: { isActive: true },
      order: { category: 'ASC', triggerThreshold: 'ASC' },
    });

    // 3. Fetch unlocks for this store
    const unlocks = await this.unlockRepo.find({
      where: { storeId },
    });
    const unlockMap = new Map(unlocks.map((u) => [u.achievementId, u]));

    // 4. Fetch showcase for this store
    const showcase = await this.showcaseRepo.find({
      where: { storeId },
      order: { position: 'ASC' },
    });
    const showcasePositionMap = new Map(
      showcase.map((s) => [s.achievementId, s.position]),
    );

    // 5. Construct unified catalog payload
    return definitions.map((def) => {
      const unlock = unlockMap.get(def.id);
      const inShowcase = showcasePositionMap.has(def.id);
      const showcasePosition = showcasePositionMap.get(def.id) || null;

      return {
        id: def.id,
        achievementId: def.id,
        code: def.name,
        name: def.name,
        title: def.name,
        description: def.description,
        imageUrl: def.imageUrl,
        badgeUrl: def.imageUrl,
        category: def.category,
        triggerType: def.triggerType,
        triggerThreshold: Number(def.triggerThreshold),
        lpBonus: def.lpBonus,
        isUnlocked: !!unlock,
        unlockedAt: unlock?.unlockedAt || null,
        lpBonusGranted: unlock?.lpBonusGranted || 0,
        inShowcase,
        showcasePosition,
        achievement: def,
      };
    });
  }

  async getStoreShowcase(storeId: string) {
    const items = await this.showcaseRepo.find({
      where: { storeId },
      relations: ['achievement'],
      order: { position: 'ASC' },
    });

    return items.map((s) => ({
      id: s.achievementId,
      showcaseId: s.id,
      storeId: s.storeId,
      achievementId: s.achievementId,
      position: s.position,
      name: s.achievement?.name,
      title: s.achievement?.name,
      description: s.achievement?.description,
      imageUrl: s.achievement?.imageUrl,
      badgeUrl: s.achievement?.imageUrl,
      category: s.achievement?.category,
      triggerType: s.achievement?.triggerType,
      triggerThreshold: Number(s.achievement?.triggerThreshold || 0),
      lpBonus: s.achievement?.lpBonus || 0,
      isUnlocked: true,
      inShowcase: true,
      achievement: s.achievement,
    }));
  }

  async updateShowcase(storeId: string, achievementIds: string[]) {
    if (!Array.isArray(achievementIds)) {
      throw new BadRequestException('achievementIds must be an array');
    }
    if (achievementIds.length > 5) {
      throw new BadRequestException(
        'Showcase can contain at most 5 achievements',
      );
    }

    if (achievementIds.length > 0) {
      // Validate that all achievements were actually unlocked by this store
      const unlocks = await this.unlockRepo.find({
        where: {
          storeId,
          achievementId: In(achievementIds),
        },
      });

      if (unlocks.length !== achievementIds.length) {
        throw new BadRequestException(
          'One or more selected achievements are not unlocked by this store',
        );
      }
    }

    // Clear existing showcase
    await this.showcaseRepo.delete({ storeId });

    // Insert new showcase items
    const newItems = achievementIds.map((achId, index) =>
      this.showcaseRepo.create({
        storeId,
        achievementId: achId,
        position: index + 1,
      }),
    );

    await this.showcaseRepo.save(newItems);
    return this.getStoreShowcase(storeId);
  }

  // Admin CRUD for Achievement Definitions
  async findAllDefinitions() {
    return this.achievementRepo.find({
      order: { createdAt: 'DESC' },
    });
  }

  async findDefinitionById(id: string) {
    const ach = await this.achievementRepo.findOne({ where: { id } });
    if (!ach) throw new NotFoundException('Achievement definition not found');
    return ach;
  }

  async createDefinition(dto: Partial<AchievementDefinition>) {
    const ach = this.achievementRepo.create(dto);
    return this.achievementRepo.save(ach);
  }

  async updateDefinition(id: string, dto: Partial<AchievementDefinition>) {
    const ach = await this.findDefinitionById(id);
    Object.assign(ach, dto);
    return this.achievementRepo.save(ach);
  }

  async deleteDefinition(id: string) {
    const ach = await this.findDefinitionById(id);
    ach.isActive = false;
    return this.achievementRepo.save(ach);
  }
}
