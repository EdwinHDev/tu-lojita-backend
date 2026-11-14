import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import * as crypto from 'crypto';
import { Company } from '../entities/company.entity';
import { CompanyCustomerProfile } from '../entities/company-customer-profile.entity';
import { CompanyCustomerNote } from '../entities/company-customer-note.entity';
import {
  CrmOfferStatus,
  CrmTargetedOffer,
} from '../entities/crm-targeted-offer.entity';
import { Store } from 'src/store/entities/store.entity';
import { Order } from 'src/order/entities/order.entity';
import { OrderItem } from 'src/order-item/entities/order-item.entity';
import { Installment } from 'src/order/entities/installment.entity';
import { Payment } from 'src/payment/entities/payment.entity';
import { OrderSlotBooking } from 'src/order/entities/order-slot-booking.entity';
import { User } from 'src/user/entities/user.entity';
import { Address } from 'src/address/entities/address.entity';
import { Item } from 'src/item/entities/item.entity';
import { ItemFavorite } from 'src/favorite/entities/item-favorite.entity';
import { OrderDispute } from 'src/order-dispute/entities/order-dispute.entity';
import { BuyerReview } from 'src/review/entities/buyer-review.entity';
import { OrderReview } from 'src/review/entities/order-review.entity';
import { StoreCustomerBlock } from 'src/store/entities/store-customer-block.entity';
import { PlatformPaymentMethod } from 'src/commission/entities/platform-payment-method.entity';
import { NotificationService } from 'src/notification/notification.service';
import { NotificationType } from 'src/notification/entities/notification.entity';
import { PlatformSettingsService } from 'src/platform-settings/platform-settings.service';
import { CompanyActivityLogService } from './company-activity-log.service';
import { CompanyPermission } from '../types/company-permission.enum';
import { OrderStatus, InstallmentStatus } from 'src/order/types';
import {
  CreateCrmCustomerNoteDto,
  CreateCrmTargetedOfferDto,
  CrmCustomersQueryDto,
  CrmSegmentKey,
  UpdateCrmCustomerProfileDto,
} from '../dto/company-crm.dto';

export interface CrmAccessContext {
  allowedStoreIds?: string[];
  actorId: string;
  actorName: string;
  isOwner: boolean;
  isAdmin: boolean;
}

export interface ConsolidatedCustomerMetrics {
  customerId: string;
  fullName: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  identification: string;
  avatarUrl: string | null;
  averageBuyerRating: number;
  totalBuyerReviews: number;
  isAccountSuspended: boolean;
  isChatBanned: boolean;
  primaryAddress: {
    id: string;
    title: string;
    fullAddress: string;
    reference?: string | null;
    latitude?: number | null;
    longitude?: number | null;
  } | null;
  primaryStore: { id: string; name: string; branchName?: string | null } | null;
  affiliatedStores: Array<{
    id: string;
    name: string;
    branchName?: string | null;
    ordersCount: number;
    ltvUsd: number;
    favoritesCount: number;
    isBlocked: boolean;
  }>;
  ltvUsd: number;
  ordersCount: number;
  completedOrdersCount: number;
  averageTicketUsd: number;
  lastOrderAt: Date | null;
  firstOrderAt: Date | null;
  pendingDebtUsd: number;
  overdueInstallmentsCount: number;
  nextDueDate: Date | null;
  favoritesCount: number;
  topFavoriteItems: Array<{
    itemId: string;
    title: string;
    price: number;
    discountPrice?: number | null;
    mainImage: string;
    storeId: string;
    storeName: string;
  }>;
  activeOffersCount: number;
  disputesCount: number;
  isBlocked: boolean;
  segment: 'VIP' | 'FREQUENT' | 'NEW' | 'AT_RISK' | 'WISHLIST';
  segments: CrmSegmentKey[];
  tags: string[];
  preferredChannel: string;
  lastContactAt: Date | null;
  nextFollowUpAt: Date | null;
  nextFollowUpNote: string | null;
  isFollowUpCompleted: boolean;
  hasOverdueFollowUp: boolean;
}

@Injectable()
export class CompanyCrmService {
  constructor(
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
    @InjectRepository(Store)
    private readonly storeRepository: Repository<Store>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Address)
    private readonly addressRepository: Repository<Address>,
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    @InjectRepository(Installment)
    private readonly installmentRepository: Repository<Installment>,
    @InjectRepository(Payment)
    private readonly paymentRepository: Repository<Payment>,
    @InjectRepository(OrderSlotBooking)
    private readonly bookingRepository: Repository<OrderSlotBooking>,
    @InjectRepository(Item)
    private readonly itemRepository: Repository<Item>,
    @InjectRepository(ItemFavorite)
    private readonly favoriteRepository: Repository<ItemFavorite>,
    @InjectRepository(OrderDispute)
    private readonly disputeRepository: Repository<OrderDispute>,
    @InjectRepository(BuyerReview)
    private readonly buyerReviewRepository: Repository<BuyerReview>,
    @InjectRepository(OrderReview)
    private readonly orderReviewRepository: Repository<OrderReview>,
    @InjectRepository(StoreCustomerBlock)
    private readonly blockRepository: Repository<StoreCustomerBlock>,
    @InjectRepository(PlatformPaymentMethod)
    private readonly platformPaymentMethodRepository: Repository<PlatformPaymentMethod>,
    @InjectRepository(CompanyCustomerProfile)
    private readonly profileRepository: Repository<CompanyCustomerProfile>,
    @InjectRepository(CompanyCustomerNote)
    private readonly noteRepository: Repository<CompanyCustomerNote>,
    @InjectRepository(CrmTargetedOffer)
    private readonly offerRepository: Repository<CrmTargetedOffer>,
    private readonly notificationService: NotificationService,
    private readonly platformSettingsService: PlatformSettingsService,
    private readonly activityLogService: CompanyActivityLogService,
  ) {}

  /**
   * Valida que el actor pertenece a la empresa y posee el permiso CRM requerido.
   */
  async validateCrmAccess(
    actor: any,
    companyId: string,
    requireManage = false,
  ): Promise<CrmAccessContext> {
    if (!actor || typeof actor !== 'object') {
      throw new ForbiddenException('Autenticación requerida para acceder al CRM');
    }

    const actorName =
      actor.fullName ||
      `${actor.firstName || ''} ${actor.lastName || ''}`.trim() ||
      actor.email ||
      'Usuario';

    if (actor.role === 'ADMIN') {
      return {
        actorId: actor.id,
        actorName,
        isOwner: false,
        isAdmin: true,
      };
    }

    if (actor.isCollaborator) {
      if (actor.company?.id !== companyId) {
        throw new ForbiddenException('No tienes acceso a esta empresa');
      }
      const perms: string[] = Array.isArray(actor.permissions)
        ? actor.permissions
        : [];
      const hasManage = perms.includes(CompanyPermission.CRM_MANAGE);
      const hasAccess = perms.includes(CompanyPermission.CRM_ACCESS) || hasManage;

      if (requireManage && !hasManage) {
        throw new ForbiddenException(
          'No posees permiso de gestión CRM (crm:manage) para esta acción',
        );
      }
      if (!requireManage && !hasAccess) {
        throw new ForbiddenException(
          'No posees permiso para acceder al módulo CRM de la empresa',
        );
      }

      return {
        allowedStoreIds: actor.hasFullBranchAccess
          ? undefined
          : actor.allowedBranchIds || [],
        actorId: actor.id,
        actorName,
        isOwner: false,
        isAdmin: false,
      };
    }

    const company = await this.companyRepository.findOne({
      where: { id: companyId, owner: { id: actor.id } },
    });
    if (!company) {
      throw new ForbiddenException('No tienes acceso a esta empresa');
    }

    return {
      actorId: actor.id,
      actorName,
      isOwner: true,
      isAdmin: false,
    };
  }

  private async getAuthorizedStores(
    companyId: string,
    access: CrmAccessContext,
    storeIdFilter?: string,
  ): Promise<Store[]> {
    const company = await this.companyRepository.findOne({
      where: { id: companyId },
      relations: ['stores'],
    });
    if (!company) {
      throw new NotFoundException('Empresa no encontrada');
    }

    let stores = (company.stores || []).filter((s) => !s.isDeleted);
    if (access.allowedStoreIds) {
      const allowedSet = new Set(access.allowedStoreIds);
      stores = stores.filter((s) => allowedSet.has(s.id));
    }

    if (storeIdFilter) {
      const target = stores.find((s) => s.id === storeIdFilter);
      if (!target) {
        throw new ForbiddenException(
          'No tienes acceso a la sucursal solicitada o no pertenece a la empresa',
        );
      }
      return [target];
    }

    return stores;
  }

  private async expireOutdatedOffers(companyId?: string): Promise<void> {
    const now = new Date();
    const qb = this.offerRepository
      .createQueryBuilder()
      .update(CrmTargetedOffer)
      .set({ status: CrmOfferStatus.EXPIRED })
      .where('status = :status', { status: CrmOfferStatus.ACTIVE })
      .andWhere('expiresAt <= :now', { now });

    if (companyId) {
      qb.andWhere('companyId = :companyId', { companyId });
    }
    await qb.execute();
  }

  /**
   * Construye el dataset consolidado de clientes de la empresa para el alcance autorizado.
   */
  private async buildConsolidatedCustomers(
    companyId: string,
    stores: Store[],
  ): Promise<{
    customers: ConsolidatedCustomerMetrics[];
    totalFavoritesCount: number;
    activeTargetedOffersCount: number;
  }> {
    const storeIds = stores.map((s) => s.id);
    if (storeIds.length === 0) {
      return {
        customers: [],
        totalFavoritesCount: 0,
        activeTargetedOffersCount: 0,
      };
    }

    await this.expireOutdatedOffers(companyId);

    const storeMap = new Map<string, Store>(stores.map((s) => [s.id, s]));

    const [orders, favorites, bookings, blocks, profiles, activeOffers] =
      await Promise.all([
        this.orderRepository.find({
          where: { store: { id: In(storeIds) } },
          relations: ['user', 'store', 'installments', 'disputes'],
          order: { createdAt: 'DESC' },
        }),
        this.favoriteRepository
          .createQueryBuilder('fav')
          .innerJoinAndSelect('fav.item', 'item')
          .innerJoinAndSelect('item.store', 'store')
          .where('store.id IN (:...storeIds)', { storeIds })
          .andWhere('item.isDeleted = false')
          .orderBy('fav.createdAt', 'DESC')
          .getMany(),
        this.bookingRepository.find({
          where: { storeId: In(storeIds) },
        }),
        this.blockRepository.find({
          where: { storeId: In(storeIds) },
        }),
        this.profileRepository.find({
          where: { companyId },
        }),
        this.offerRepository.find({
          where: {
            companyId,
            storeId: In(storeIds),
            status: CrmOfferStatus.ACTIVE,
          },
        }),
      ]);

    const customerIdsSet = new Set<string>();
    for (const o of orders) {
      if (o.user?.id) customerIdsSet.add(o.user.id);
    }
    for (const f of favorites) {
      if (f.userId) customerIdsSet.add(f.userId);
    }
    for (const b of bookings) {
      if (b.customerId) customerIdsSet.add(b.customerId);
    }
    for (const p of profiles) {
      if (p.customerId) customerIdsSet.add(p.customerId);
    }

    const customerIds = Array.from(customerIdsSet);
    if (customerIds.length === 0) {
      return {
        customers: [],
        totalFavoritesCount: favorites.length,
        activeTargetedOffersCount: activeOffers.length,
      };
    }

    const [users, addresses] = await Promise.all([
      this.userRepository.find({ where: { id: In(customerIds) } }),
      this.addressRepository.find({
        where: { user: { id: In(customerIds) } },
        relations: ['user'],
        order: { isActive: 'DESC', updatedAt: 'DESC' },
      }),
    ]);

    const userMap = new Map<string, User>(users.map((u) => [u.id, u]));
    const addressesByUser = new Map<string, Address[]>();
    for (const addr of addresses) {
      const uid = addr.user?.id;
      if (!uid) continue;
      if (!addressesByUser.has(uid)) addressesByUser.set(uid, []);
      addressesByUser.get(uid)!.push(addr);
    }

    const profileMap = new Map<string, CompanyCustomerProfile>(
      profiles.map((p) => [p.customerId, p]),
    );

    const now = new Date();
    const fortyFiveDaysAgo = new Date(now.getTime() - 45 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

    const consolidated: ConsolidatedCustomerMetrics[] = [];

    for (const customerId of customerIds) {
      const user = userMap.get(customerId);
      if (!user) continue;

      const userOrders = orders.filter((o) => o.user?.id === customerId);
      const userFavorites = favorites.filter((f) => f.userId === customerId);
      const userBookings = bookings.filter((b) => b.customerId === customerId);
      const userBlocks = blocks.filter((b) => b.customerId === customerId);
      const userOffers = activeOffers.filter(
        (of) => of.customerId === customerId && of.expiresAt > now,
      );
      const profile = profileMap.get(customerId);

      // Si filtraron por una sucursal y este perfil no tiene actividad allí (ej. solo profile global sin ordenes/favs/bookings en esa sucursal), omitir
      if (
        userOrders.length === 0 &&
        userFavorites.length === 0 &&
        userBookings.length === 0 &&
        userBlocks.length === 0 &&
        userOffers.length === 0
      ) {
        continue;
      }

      const validOrders = userOrders.filter(
        (o) =>
          o.status !== OrderStatus.CANCELLED &&
          o.status !== OrderStatus.REJECTED,
      );

      let ltvUsd = 0;
      let pendingDebtUsd = 0;
      let overdueInstallmentsCount = 0;
      let nextDueDate: Date | null = null;
      let disputesCount = 0;
      let lastOrderAt: Date | null = null;
      let firstOrderAt: Date | null = null;
      let completedOrdersCount = 0;

      const storeStats = new Map<
        string,
        { ordersCount: number; ltvUsd: number; favoritesCount: number }
      >();

      const ensureStoreStat = (sid: string) => {
        if (!storeStats.has(sid)) {
          storeStats.set(sid, { ordersCount: 0, ltvUsd: 0, favoritesCount: 0 });
        }
        return storeStats.get(sid)!;
      };

      for (const o of userOrders) {
        const sid = o.store?.id;
        disputesCount += (o.disputes || []).length;

        if (
          o.status !== OrderStatus.CANCELLED &&
          o.status !== OrderStatus.REJECTED
        ) {
          const orderVal = Number(o.finalAmount || o.totalAmount || 0);
          ltvUsd += orderVal;
          if (o.status === OrderStatus.FULLY_PAID || o.isFullyPaid) {
            completedOrdersCount += 1;
          }

          if (!lastOrderAt || o.createdAt > lastOrderAt) lastOrderAt = o.createdAt;
          if (!firstOrderAt || o.createdAt < firstOrderAt) {
            firstOrderAt = o.createdAt;
          }

          if (sid) {
            const st = ensureStoreStat(sid);
            st.ordersCount += 1;
            st.ltvUsd += orderVal;
          }

          if (!o.isFullyPaid && Number(o.remainingBalance || 0) > 0) {
            pendingDebtUsd += Number(o.remainingBalance || 0);
            if (o.nextDueDate) {
              if (!nextDueDate || o.nextDueDate < nextDueDate) {
                nextDueDate = o.nextDueDate;
              }
            }
          }

          for (const inst of o.installments || []) {
            if (
              inst.status === InstallmentStatus.OVERDUE ||
              (inst.status === InstallmentStatus.PENDING &&
                inst.dueDate &&
                new Date(inst.dueDate) < now)
            ) {
              overdueInstallmentsCount += 1;
            }
          }
        } else if (sid) {
          ensureStoreStat(sid);
        }
      }

      for (const fav of userFavorites) {
        const sid = fav.item?.store?.id;
        if (sid) {
          ensureStoreStat(sid).favoritesCount += 1;
        }
      }

      for (const bk of userBookings) {
        if (bk.storeId) {
          ensureStoreStat(bk.storeId);
        }
      }

      const affiliatedStores = Array.from(storeStats.entries())
        .map(([sid, st]) => {
          const s = storeMap.get(sid);
          if (!s) return null;
          return {
            id: s.id,
            name: s.name,
            branchName: s.branchName || null,
            ordersCount: st.ordersCount,
            ltvUsd: Number(st.ltvUsd.toFixed(2)),
            favoritesCount: st.favoritesCount,
            isBlocked: userBlocks.some((b) => b.storeId === s.id),
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null)
        .sort((a, b) => b.ltvUsd - a.ltvUsd || b.favoritesCount - a.favoritesCount);

      const primaryStore = affiliatedStores[0]
        ? {
            id: affiliatedStores[0].id,
            name: affiliatedStores[0].name,
            branchName: affiliatedStores[0].branchName,
          }
        : null;

      // Segmentación RFM automática
      const ordersCount = validOrders.length;
      let primarySegment: ConsolidatedCustomerMetrics['segment'] = 'NEW';
      if (ordersCount === 0 && userFavorites.length > 0) {
        primarySegment = 'WISHLIST';
      } else if (ltvUsd >= 250 || ordersCount >= 4) {
        primarySegment =
          lastOrderAt && lastOrderAt < sixtyDaysAgo ? 'AT_RISK' : 'VIP';
      } else if (ordersCount >= 2) {
        primarySegment =
          lastOrderAt && lastOrderAt < fortyFiveDaysAgo ? 'AT_RISK' : 'FREQUENT';
      } else if (lastOrderAt && lastOrderAt < fortyFiveDaysAgo) {
        primarySegment = 'AT_RISK';
      } else {
        primarySegment = 'NEW';
      }

      const segments: CrmSegmentKey[] = [primarySegment];
      if (pendingDebtUsd > 0) segments.push('WITH_DEBT');
      if (userBlocks.length > 0) segments.push('BLOCKED');
      if (userFavorites.length > 0 && !segments.includes('WISHLIST')) {
        segments.push('WISHLIST');
      }

      const userAddresses = addressesByUser.get(customerId) || [];
      const primaryAddr = userAddresses[0] || null;
      const fullName = `${user.firstName || ''} ${user.lastName || ''}`.trim();

      const followUpAt = profile?.nextFollowUpAt || null;
      const isFollowUpCompleted = profile?.isFollowUpCompleted || false;
      const hasOverdueFollowUp = Boolean(
        followUpAt && !isFollowUpCompleted && followUpAt < now,
      );

      consolidated.push({
        customerId,
        fullName: fullName || user.email,
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        phone: user.phone || '',
        email: user.email || '',
        identification: user.identification || '',
        avatarUrl: user.avatarUrl || null,
        averageBuyerRating: Number(user.averageBuyerRating || 0),
        totalBuyerReviews: Number(user.totalBuyerReviews || 0),
        isAccountSuspended: Boolean(
          user.accountSuspendedUntil && user.accountSuspendedUntil > now,
        ),
        isChatBanned: Boolean(user.isChatBannedPermanently),
        primaryAddress: primaryAddr
          ? {
              id: primaryAddr.id,
              title: primaryAddr.title,
              fullAddress: primaryAddr.fullAddress,
              reference: primaryAddr.reference || null,
              latitude: primaryAddr.latitude ?? null,
              longitude: primaryAddr.longitude ?? null,
            }
          : null,
        primaryStore,
        affiliatedStores,
        ltvUsd: Number(ltvUsd.toFixed(2)),
        ordersCount,
        completedOrdersCount,
        averageTicketUsd:
          ordersCount > 0 ? Number((ltvUsd / ordersCount).toFixed(2)) : 0,
        lastOrderAt,
        firstOrderAt,
        pendingDebtUsd: Number(pendingDebtUsd.toFixed(2)),
        overdueInstallmentsCount,
        nextDueDate,
        favoritesCount: userFavorites.length,
        topFavoriteItems: userFavorites.slice(0, 3).map((fav) => ({
          itemId: fav.item.id,
          title: fav.item.title,
          price: Number(fav.item.price || 0),
          discountPrice: fav.item.discountPrice ?? null,
          mainImage: fav.item.mainImage || '',
          storeId: fav.item.store?.id || '',
          storeName: fav.item.store?.branchName
            ? `${fav.item.store.name} (${fav.item.store.branchName})`
            : fav.item.store?.name || '',
        })),
        activeOffersCount: userOffers.length,
        disputesCount,
        isBlocked: userBlocks.length > 0,
        segment: primarySegment,
        segments,
        tags: profile?.tags || [],
        preferredChannel: profile?.preferredChannel || 'WHATSAPP',
        lastContactAt: profile?.lastContactAt || null,
        nextFollowUpAt: followUpAt,
        nextFollowUpNote: profile?.nextFollowUpNote || null,
        isFollowUpCompleted,
        hasOverdueFollowUp,
      });
    }

    return {
      customers: consolidated,
      totalFavoritesCount: favorites.length,
      activeTargetedOffersCount: activeOffers.filter((o) => o.expiresAt > now)
        .length,
    };
  }

  async getSummary(companyId: string, actor: any, storeId?: string) {
    const access = await this.validateCrmAccess(actor, companyId, false);
    const stores = await this.getAuthorizedStores(companyId, access, storeId);

    const [consolidatedData, exchangeRate, crmOfferConfig] = await Promise.all([
      this.buildConsolidatedCustomers(companyId, stores),
      this.platformSettingsService.getExchangeRateConfig(),
      this.platformSettingsService.getCrmOfferConfig(),
    ]);

    const { customers, totalFavoritesCount, activeTargetedOffersCount } =
      consolidatedData;

    const totalLtvUsd = Number(
      customers.reduce((acc, c) => acc + c.ltvUsd, 0).toFixed(2),
    );
    const totalPendingDebtUsd = Number(
      customers.reduce((acc, c) => acc + c.pendingDebtUsd, 0).toFixed(2),
    );

    return {
      totalCustomers: customers.length,
      vipCount: customers.filter((c) => c.segment === 'VIP').length,
      frequentCount: customers.filter((c) => c.segment === 'FREQUENT').length,
      newCount: customers.filter((c) => c.segment === 'NEW').length,
      atRiskCount: customers.filter((c) => c.segment === 'AT_RISK').length,
      wishlistOnlyCount: customers.filter((c) => c.segment === 'WISHLIST').length,
      withDebtCount: customers.filter((c) => c.pendingDebtUsd > 0).length,
      blockedCount: customers.filter((c) => c.isBlocked).length,
      totalLtvUsd,
      totalPendingDebtUsd,
      totalFavoritesCount,
      activeTargetedOffersCount,
      pendingFollowUpsCount: customers.filter(
        (c) => c.nextFollowUpAt && !c.isFollowUpCompleted,
      ).length,
      overdueFollowUpsCount: customers.filter((c) => c.hasOverdueFollowUp)
        .length,
      authorizedStores: stores.map((s) => ({
        id: s.id,
        name: s.name,
        branchName: s.branchName || null,
      })),
      exchangeRate,
      crmOfferConfig,
    };
  }

  async listCustomers(
    companyId: string,
    actor: any,
    query: CrmCustomersQueryDto,
  ) {
    const access = await this.validateCrmAccess(actor, companyId, false);
    const stores = await this.getAuthorizedStores(
      companyId,
      access,
      query.storeId,
    );

    const [consolidatedData, exchangeRate, crmOfferConfig] = await Promise.all([
      this.buildConsolidatedCustomers(companyId, stores),
      this.platformSettingsService.getExchangeRateConfig(),
      this.platformSettingsService.getCrmOfferConfig(),
    ]);

    let list = consolidatedData.customers;

    if (query.search && query.search.trim()) {
      const needle = query.search.trim().toLowerCase();
      list = list.filter((c) => {
        const haystack = [
          c.fullName,
          c.email,
          c.phone,
          c.identification,
          c.primaryAddress?.fullAddress || '',
          c.primaryAddress?.title || '',
          ...(c.tags || []),
        ]
          .join(' ')
          .toLowerCase();
        return haystack.includes(needle);
      });
    }

    if (query.segment) {
      list = list.filter((c) => c.segments.includes(query.segment!));
    }

    const sortBy = query.sortBy || 'ltv';
    const dir = query.sortOrder === 'ASC' ? 1 : -1;

    list.sort((a, b) => {
      switch (sortBy) {
        case 'ordersCount':
          return (a.ordersCount - b.ordersCount) * dir;
        case 'debt':
          return (a.pendingDebtUsd - b.pendingDebtUsd) * dir;
        case 'favoritesCount':
          return (a.favoritesCount - b.favoritesCount) * dir;
        case 'rating':
          return (a.averageBuyerRating - b.averageBuyerRating) * dir;
        case 'lastOrderAt': {
          const ta = a.lastOrderAt ? a.lastOrderAt.getTime() : 0;
          const tb = b.lastOrderAt ? b.lastOrderAt.getTime() : 0;
          return (ta - tb) * dir;
        }
        case 'ltv':
        default:
          return (a.ltvUsd - b.ltvUsd) * dir;
      }
    });

    const page = Math.max(1, Number(query.page || 1));
    const limit = Math.min(100, Math.max(1, Number(query.limit || 25)));
    const total = list.length;
    const start = (page - 1) * limit;
    const customers = list.slice(start, start + limit);

    return {
      customers,
      total,
      page,
      limit,
      exchangeRate,
      crmOfferConfig,
    };
  }

  async getCustomerDetail(
    companyId: string,
    customerId: string,
    actor: any,
    storeId?: string,
  ) {
    const access = await this.validateCrmAccess(actor, companyId, false);
    const stores = await this.getAuthorizedStores(companyId, access, storeId);
    const storeIds = stores.map((s) => s.id);

    const [
      consolidatedData,
      user,
      addresses,
      notes,
      favorites,
      orders,
      bookings,
      blocks,
      offers,
      exchangeRate,
      crmOfferConfig,
    ] = await Promise.all([
      this.buildConsolidatedCustomers(companyId, stores),
      this.userRepository.findOne({ where: { id: customerId } }),
      this.addressRepository.find({
        where: { user: { id: customerId } },
        order: { isActive: 'DESC', updatedAt: 'DESC' },
      }),
      this.noteRepository.find({
        where: { companyId, customerId },
        order: { createdAt: 'DESC' },
      }),
      storeIds.length > 0
        ? this.favoriteRepository
            .createQueryBuilder('fav')
            .innerJoinAndSelect('fav.item', 'item')
            .innerJoinAndSelect('item.store', 'store')
            .where('fav.userId = :customerId', { customerId })
            .andWhere('store.id IN (:...storeIds)', { storeIds })
            .andWhere('item.isDeleted = false')
            .orderBy('fav.createdAt', 'DESC')
            .getMany()
        : Promise.resolve([]),
      storeIds.length > 0
        ? this.orderRepository.find({
            where: {
              user: { id: customerId },
              store: { id: In(storeIds) },
            },
            relations: [
              'store',
              'orderItems',
              'orderItems.item',
              'installments',
              'payments',
              'disputes',
            ],
            order: { createdAt: 'DESC' },
          })
        : Promise.resolve([]),
      storeIds.length > 0
        ? this.bookingRepository.find({
            where: { customerId, storeId: In(storeIds) },
            order: { bookingDate: 'DESC' },
          })
        : Promise.resolve([]),
      storeIds.length > 0
        ? this.blockRepository.find({
            where: { customerId, storeId: In(storeIds) },
          })
        : Promise.resolve([]),
      storeIds.length > 0
        ? this.offerRepository.find({
            where: { companyId, customerId, storeId: In(storeIds) },
            relations: ['item', 'store'],
            order: { createdAt: 'DESC' },
          })
        : Promise.resolve([]),
      this.platformSettingsService.getExchangeRateConfig(),
      this.platformSettingsService.getCrmOfferConfig(),
    ]);

    if (!user) {
      throw new NotFoundException('Cliente no encontrado');
    }

    const summary = consolidatedData.customers.find(
      (c) => c.customerId === customerId,
    );

    if (
      !summary &&
      orders.length === 0 &&
      favorites.length === 0 &&
      bookings.length === 0 &&
      notes.length === 0
    ) {
      throw new NotFoundException(
        'El cliente no registra historial ni actividad en las sucursales autorizadas de esta empresa',
      );
    }

    const orderIds = orders.map((o) => o.id);
    const [buyerReviews, orderReviewsWritten, disputes] = await Promise.all([
      orderIds.length > 0
        ? this.buyerReviewRepository.find({
            where: { targetUserId: customerId, orderId: In(orderIds) },
            relations: ['author'],
            order: { createdAt: 'DESC' },
          })
        : Promise.resolve([]),
      orderIds.length > 0
        ? this.orderReviewRepository.find({
            where: { authorId: customerId, orderId: In(orderIds) },
            order: { createdAt: 'DESC' },
          })
        : Promise.resolve([]),
      orderIds.length > 0
        ? this.disputeRepository.find({
            where: { orderId: In(orderIds) },
            order: { createdAt: 'DESC' },
          })
        : Promise.resolve([]),
    ]);

    const now = new Date();
    const storeMap = new Map(stores.map((s) => [s.id, s]));

    const favoriteItems = favorites.map((fav) => {
      const activeOffer = offers.find(
        (of) =>
          of.itemId === fav.item.id &&
          of.status === CrmOfferStatus.ACTIVE &&
          of.expiresAt > now,
      );
      return {
        favoriteId: fav.id,
        itemId: fav.item.id,
        title: fav.item.title,
        price: Number(fav.item.price || 0),
        discountPrice: fav.item.discountPrice ?? null,
        priceWhenAdded: fav.priceWhenAdded ?? null,
        mainImage: fav.item.mainImage || '',
        stockQuantity: Number(fav.item.stockQuantity || 0),
        trackInventory: Boolean(fav.item.trackInventory),
        isActive: Boolean(fav.item.isActive),
        storeId: fav.item.store?.id || '',
        storeName: fav.item.store?.branchName
          ? `${fav.item.store.name} (${fav.item.store.branchName})`
          : fav.item.store?.name || '',
        favoritedAt: fav.createdAt,
        activeOffer: activeOffer
          ? {
              id: activeOffer.id,
              offerCode: activeOffer.offerCode,
              offerPrice: activeOffer.offerPrice,
              originalPrice: activeOffer.originalPrice,
              discountPercent: activeOffer.discountPercent,
              durationHours: activeOffer.durationHours,
              expiresAt: activeOffer.expiresAt,
              status: activeOffer.status,
              deepLinkUrl: activeOffer.deepLinkUrl,
              whatsappShareText: activeOffer.whatsappShareText,
            }
          : null,
      };
    });

    return {
      customer: summary || {
        customerId: user.id,
        fullName: `${user.firstName} ${user.lastName}`.trim(),
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
        email: user.email,
        identification: user.identification,
        avatarUrl: user.avatarUrl || null,
        averageBuyerRating: Number(user.averageBuyerRating || 0),
        totalBuyerReviews: Number(user.totalBuyerReviews || 0),
        isAccountSuspended: Boolean(
          user.accountSuspendedUntil && user.accountSuspendedUntil > now,
        ),
        isChatBanned: Boolean(user.isChatBannedPermanently),
        primaryAddress: addresses[0] || null,
        primaryStore: null,
        affiliatedStores: [],
        ltvUsd: 0,
        ordersCount: 0,
        completedOrdersCount: 0,
        averageTicketUsd: 0,
        lastOrderAt: null,
        firstOrderAt: null,
        pendingDebtUsd: 0,
        overdueInstallmentsCount: 0,
        nextDueDate: null,
        favoritesCount: favoriteItems.length,
        topFavoriteItems: favoriteItems.slice(0, 3),
        activeOffersCount: 0,
        disputesCount: 0,
        isBlocked: blocks.length > 0,
        segment: 'NEW',
        segments: ['NEW'],
        tags: [],
        preferredChannel: 'WHATSAPP',
        lastContactAt: null,
        nextFollowUpAt: null,
        nextFollowUpNote: null,
        isFollowUpCompleted: false,
        hasOverdueFollowUp: false,
      },
      addresses: addresses.map((a) => ({
        id: a.id,
        title: a.title,
        fullAddress: a.fullAddress,
        reference: a.reference || null,
        latitude: a.latitude ?? null,
        longitude: a.longitude ?? null,
        isActive: a.isActive,
      })),
      notes: notes.map((n) => ({
        id: n.id,
        authorId: n.authorId || null,
        authorName: n.authorName,
        content: n.content,
        category: n.category,
        createdAt: n.createdAt,
      })),
      favoriteItems,
      targetedOffers: offers.map((of) => ({
        id: of.id,
        offerCode: of.offerCode,
        itemId: of.itemId,
        itemTitle: of.item?.title || '',
        itemMainImage: of.item?.mainImage || '',
        storeId: of.storeId,
        storeName: of.store?.branchName
          ? `${of.store.name} (${of.store.branchName})`
          : of.store?.name || '',
        originalPrice: of.originalPrice,
        offerPrice: of.offerPrice,
        discountPercent: of.discountPercent,
        durationHours: of.durationHours,
        expiresAt: of.expiresAt,
        status:
          of.status === CrmOfferStatus.ACTIVE && of.expiresAt <= now
            ? CrmOfferStatus.EXPIRED
            : of.status,
        serviceFeeUsd: of.serviceFeeUsd,
        paymentMethod: of.paymentMethod || null,
        paymentReference: of.paymentReference || null,
        deepLinkUrl: of.deepLinkUrl,
        whatsappShareText: of.whatsappShareText,
        messageToCustomer: of.messageToCustomer || null,
        createdAt: of.createdAt,
      })),
      orders: orders.map((o) => ({
        id: o.id,
        storeId: o.store?.id || '',
        storeName: o.store?.branchName
          ? `${o.store.name} (${o.store.branchName})`
          : o.store?.name || '',
        status: o.status,
        totalAmount: Number(o.totalAmount || 0),
        finalAmount: Number(o.finalAmount || o.totalAmount || 0),
        totalPaidAmount: Number(o.totalPaidAmount || 0),
        remainingBalance: Number(o.remainingBalance || 0),
        isPartialPayment: Boolean(o.isPartialPayment),
        isFullyPaid: Boolean(o.isFullyPaid),
        nextDueDate: o.nextDueDate || null,
        exchangeRate: o.exchangeRate ? Number(o.exchangeRate) : null,
        preOrderStatus: o.preOrderStatus || null,
        createdAt: o.createdAt,
        items: (o.orderItems || []).map((oi: OrderItem) => ({
          id: oi.id,
          itemId: oi.item?.id || null,
          title: oi.title,
          quantity: oi.quantity,
          price: Number(oi.price || 0),
          variantLabel: oi.variantLabel || null,
        })),
        installments: (o.installments || []).map((inst) => ({
          id: inst.id,
          amount: Number(inst.amount || 0),
          paidAmount: Number(inst.paidAmount || 0),
          dueDate: inst.dueDate,
          status: inst.status,
          lateFeeApplied: Number(inst.lateFeeApplied || 0),
          extensionStatus: inst.extensionStatus,
        })),
        payments: (o.payments || []).map((pay) => ({
          id: pay.id,
          amount: Number(pay.amount || 0),
          currency: pay.currency,
          exchangeRate: pay.exchangeRate ? Number(pay.exchangeRate) : null,
          paymentMethod: pay.paymentMethod,
          reference: pay.reference || null,
          status: pay.status,
          createdAt: pay.createdAt,
        })),
      })),
      slotBookings: bookings.map((bk) => {
        const s = storeMap.get(bk.storeId);
        return {
          id: bk.id,
          orderId: bk.orderId,
          storeId: bk.storeId,
          storeName: s?.branchName ? `${s.name} (${s.branchName})` : s?.name || '',
          bookingDate: bk.bookingDate,
          slotStartTime: bk.slotStartTime,
          slotEndTime: bk.slotEndTime,
          slotLabel: bk.slotLabel || null,
          status: bk.status,
        };
      }),
      reputation: {
        buyerRating: Number(user.averageBuyerRating || 0),
        totalBuyerReviews: Number(user.totalBuyerReviews || 0),
        buyerReviews: buyerReviews.map((br) => ({
          id: br.id,
          orderId: br.orderId,
          rating: br.rating,
          comment: br.comment || null,
          authorName: br.author
            ? `${br.author.firstName} ${br.author.lastName}`.trim()
            : 'Comercio',
          createdAt: br.createdAt,
        })),
        orderReviewsWritten: orderReviewsWritten.map((orv) => ({
          id: orv.id,
          orderId: orv.orderId,
          rating: orv.rating,
          comment: orv.comment || null,
          vendorReply: orv.vendorReply || null,
          createdAt: orv.createdAt,
        })),
        disputes: disputes.map((d) => ({
          id: d.id,
          orderId: d.orderId,
          type: d.type,
          status: d.status,
          description: d.description,
          verdict: d.verdict || null,
          buyerPenalty: d.buyerPenalty,
          resolvedAt: d.resolvedAt || null,
          createdAt: d.createdAt,
        })),
        blocks: blocks.map((blk) => {
          const s = storeMap.get(blk.storeId);
          return {
            id: blk.id,
            storeId: blk.storeId,
            storeName: s?.branchName ? `${s.name} (${s.branchName})` : s?.name || '',
            reason: blk.reason || null,
            createdAt: blk.createdAt,
          };
        }),
      },
      exchangeRate,
      crmOfferConfig,
    };
  }

  async updateCustomerProfile(
    companyId: string,
    customerId: string,
    dto: UpdateCrmCustomerProfileDto,
    actor: any,
  ) {
    const access = await this.validateCrmAccess(actor, companyId, true);
    const customer = await this.userRepository.findOne({
      where: { id: customerId },
    });
    if (!customer) {
      throw new NotFoundException('Cliente no encontrado');
    }

    let profile = await this.profileRepository.findOne({
      where: { companyId, customerId },
    });

    if (!profile) {
      profile = this.profileRepository.create({
        companyId,
        customerId,
        tags: [],
        preferredChannel: 'WHATSAPP',
      });
    }

    if (dto.tags !== undefined) {
      const normalized = Array.from(
        new Set(
          dto.tags
            .map((t) => String(t).trim())
            .filter((t) => t.length > 0)
            .slice(0, 20),
        ),
      );
      profile.tags = normalized;
    }

    if (dto.preferredChannel !== undefined) {
      profile.preferredChannel = dto.preferredChannel;
    }

    if (dto.markContactedNow) {
      profile.lastContactAt = new Date();
    } else if (dto.lastContactAt !== undefined) {
      profile.lastContactAt = dto.lastContactAt
        ? new Date(dto.lastContactAt)
        : null;
    }

    if (dto.nextFollowUpAt !== undefined) {
      profile.nextFollowUpAt = dto.nextFollowUpAt
        ? new Date(dto.nextFollowUpAt)
        : null;
    }

    if (dto.nextFollowUpNote !== undefined) {
      profile.nextFollowUpNote = dto.nextFollowUpNote?.trim() || null;
    }

    if (dto.isFollowUpCompleted !== undefined) {
      profile.isFollowUpCompleted = dto.isFollowUpCompleted;
    }

    const saved = await this.profileRepository.save(profile);

    await this.activityLogService.log({
      companyId,
      user: actor,
      module: 'COMPANY_CRM',
      action: 'UPDATE_CUSTOMER_PROFILE',
      description: `${access.actorName} actualizó perfil CRM del cliente ${customer.firstName} ${customer.lastName}`,
      entityType: 'CompanyCustomerProfile',
      entityId: saved.id,
      metadata: {
        customerId,
        tags: saved.tags,
        nextFollowUpAt: saved.nextFollowUpAt,
      },
    });

    return saved;
  }

  async addCustomerNote(
    companyId: string,
    customerId: string,
    dto: CreateCrmCustomerNoteDto,
    actor: any,
  ) {
    const access = await this.validateCrmAccess(actor, companyId, true);
    const customer = await this.userRepository.findOne({
      where: { id: customerId },
    });
    if (!customer) {
      throw new NotFoundException('Cliente no encontrado');
    }

    const content = dto.content?.trim();
    if (!content) {
      throw new BadRequestException('El contenido de la nota es obligatorio');
    }

    const note = this.noteRepository.create({
      companyId,
      customerId,
      authorId: access.actorId,
      authorName: access.actorName,
      content,
      category: dto.category || 'GENERAL',
    });

    const saved = await this.noteRepository.save(note);

    await this.activityLogService.log({
      companyId,
      user: actor,
      module: 'COMPANY_CRM',
      action: 'ADD_CUSTOMER_NOTE',
      description: `${access.actorName} agregó una nota (${saved.category}) al cliente ${customer.firstName} ${customer.lastName}`,
      entityType: 'CompanyCustomerNote',
      entityId: saved.id,
      metadata: { customerId, category: saved.category },
    });

    return saved;
  }

  async getOffersConfig(companyId: string, actor: any) {
    await this.validateCrmAccess(actor, companyId, false);
    const [config, paymentMethods] = await Promise.all([
      this.platformSettingsService.getCrmOfferConfig(),
      this.platformPaymentMethodRepository.find({
        where: { isActive: true },
        order: { createdAt: 'ASC' },
      }),
    ]);

    return {
      ...config,
      platformPaymentMethods: paymentMethods.map((m) => ({
        id: m.id,
        title: m.title,
        name: m.title,
        type: m.type,
        accountDetails: m.accountDetails,
        qrImageUrl: m.qrImageUrl || null,
        instructions: m.instructions || null,
      })),
    };
  }

  async createTargetedOffer(
    companyId: string,
    customerId: string,
    dto: CreateCrmTargetedOfferDto,
    actor: any,
  ) {
    const access = await this.validateCrmAccess(actor, companyId, true);
    const [config, stores, customer, item, exchangeRate] = await Promise.all([
      this.platformSettingsService.getCrmOfferConfig(),
      this.getAuthorizedStores(companyId, access),
      this.userRepository.findOne({ where: { id: customerId } }),
      this.itemRepository.findOne({
        where: { id: dto.itemId },
        relations: ['store'],
      }),
      this.platformSettingsService.getExchangeRateConfig(),
    ]);

    if (!config.enabled) {
      throw new BadRequestException(
        'El servicio de Ofertas Especiales CRM se encuentra deshabilitado por administración',
      );
    }

    if (!customer) {
      throw new NotFoundException('Cliente no encontrado');
    }

    if (!item || item.isDeleted || !item.isActive) {
      throw new NotFoundException('Artículo no disponible');
    }

    const authorizedStoreIds = new Set(stores.map((s) => s.id));
    if (!item.store?.id || !authorizedStoreIds.has(item.store.id)) {
      throw new ForbiddenException(
        'El artículo seleccionado no pertenece a tus sucursales autorizadas',
      );
    }

    // Regla estricta: solo enviar ofertas para artículos en favoritos del cliente
    const favorite = await this.favoriteRepository.findOne({
      where: { userId: customerId, itemId: item.id },
    });
    if (!favorite) {
      throw new BadRequestException(
        'Solo puedes enviar ofertas dirigidas para artículos que el cliente tiene en su lista de favoritos',
      );
    }

    const originalPrice = Number(item.price || 0);
    const offerPrice = Number(Number(dto.offerPrice).toFixed(2));
    if (!(offerPrice > 0) || !(offerPrice < originalPrice)) {
      throw new BadRequestException(
        `El precio de oferta ($${offerPrice.toFixed(2)}) debe ser mayor a $0.00 y menor al precio actual ($${originalPrice.toFixed(2)})`,
      );
    }

    const serviceFeeUsd = Number(config.feePerCampaign || 0);
    if (serviceFeeUsd > 0) {
      if (!dto.paymentMethod?.trim() || !dto.paymentReference?.trim()) {
        throw new BadRequestException(
          `Esta campaña tiene un costo de $${serviceFeeUsd.toFixed(2)} USD. Debes seleccionar un método de pago de la plataforma y registrar el número de referencia.`,
        );
      }
    }

    const discountPercent = Number(
      (((originalPrice - offerPrice) / originalPrice) * 100).toFixed(2),
    );
    const offerCode = `OFR-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    const expiresAt = new Date(
      Date.now() + Number(dto.durationHours) * 3600 * 1000,
    );
    const deepLinkUrl = `https://api.tulojita.com/api/v1/crm-offers/redirect/${offerCode}`;

    const storeLabel = item.store.branchName
      ? `${item.store.name} (${item.store.branchName})`
      : item.store.name;
    const bsOffer =
      exchangeRate?.enabled && exchangeRate.rate > 0
        ? ` (Bs. ${(offerPrice * exchangeRate.rate).toFixed(2)})`
        : '';
    const customMsg = dto.messageToCustomer?.trim()
      ? `\n${dto.messageToCustomer.trim()}`
      : '';
    const whatsappShareText =
      `¡Hola ${customer.firstName}! En ${storeLabel} vimos que te interesa *${item.title}* y activamos una Oferta Especial solo para ti: ` +
      `antes $${originalPrice.toFixed(2)} USD → ahora *$${offerPrice.toFixed(2)} USD*${bsOffer} (-${discountPercent.toFixed(0)}%). ` +
      `Válida por *${dto.durationHours}h*.${customMsg}\nAprovecha aquí: ${deepLinkUrl}`;

    const offer = this.offerRepository.create({
      companyId,
      storeId: item.store.id,
      customerId,
      itemId: item.id,
      createdByUserId: access.actorId,
      offerCode,
      originalPrice,
      offerPrice,
      discountPercent,
      durationHours: dto.durationHours,
      expiresAt,
      status: CrmOfferStatus.ACTIVE,
      serviceFeeUsd,
      paymentMethod: dto.paymentMethod?.trim() || null,
      paymentReference: dto.paymentReference?.trim() || null,
      deepLinkUrl,
      whatsappShareText,
      messageToCustomer: dto.messageToCustomer?.trim() || null,
    });

    const savedOffer = await this.offerRepository.save(offer);

    // Actualizar fecha de último contacto del cliente en perfil CRM
    let profile = await this.profileRepository.findOne({
      where: { companyId, customerId },
    });
    if (!profile) {
      profile = this.profileRepository.create({
        companyId,
        customerId,
        tags: [],
        preferredChannel: 'WHATSAPP',
      });
    }
    profile.lastContactAt = new Date();
    await this.profileRepository.save(profile);

    // Push + Notificación in-app directa al comprador
    await this.notificationService.create({
      userId: customerId,
      title: `🎁 Oferta especial para ti en ${item.store.name}`,
      body: `"${item.title}" bajó de $${originalPrice.toFixed(2)} a $${offerPrice.toFixed(2)} USD (-${discountPercent.toFixed(0)}%) solo por ${dto.durationHours} horas. Código: ${offerCode}.`,
      type: NotificationType.CRM_OFFER,
      channelType: 'CRM_OFFER',
      targetId: item.id,
      storeId: item.store.id,
      itemId: item.id,
      offerCode,
    });

    await this.activityLogService.log({
      companyId,
      storeId: item.store.id,
      user: actor,
      module: 'COMPANY_CRM',
      action: 'CREATE_TARGETED_OFFER',
      description: `${access.actorName} envió oferta ${offerCode} por "${item.title}" ($${offerPrice.toFixed(2)}) a ${customer.firstName} ${customer.lastName}`,
      entityType: 'CrmTargetedOffer',
      entityId: savedOffer.id,
      metadata: {
        customerId,
        itemId: item.id,
        offerPrice,
        discountPercent,
        durationHours: dto.durationHours,
        serviceFeeUsd,
      },
    });

    return {
      ...savedOffer,
      itemTitle: item.title,
      itemMainImage: item.mainImage || '',
      storeName: storeLabel,
    };
  }

  async listOffers(
    companyId: string,
    actor: any,
    storeId?: string,
    status?: CrmOfferStatus,
  ) {
    const access = await this.validateCrmAccess(actor, companyId, false);
    const stores = await this.getAuthorizedStores(companyId, access, storeId);
    const storeIds = stores.map((s) => s.id);
    if (storeIds.length === 0) return { offers: [] };

    await this.expireOutdatedOffers(companyId);

    const where: any = {
      companyId,
      storeId: In(storeIds),
    };
    if (status) where.status = status;

    const offers = await this.offerRepository.find({
      where,
      relations: ['item', 'store', 'customer'],
      order: { createdAt: 'DESC' },
    });

    return {
      offers: offers.map((of) => ({
        id: of.id,
        offerCode: of.offerCode,
        customerId: of.customerId,
        customerName: of.customer
          ? `${of.customer.firstName} ${of.customer.lastName}`.trim()
          : 'Cliente',
        itemId: of.itemId,
        itemTitle: of.item?.title || '',
        itemMainImage: of.item?.mainImage || '',
        storeId: of.storeId,
        storeName: of.store?.branchName
          ? `${of.store.name} (${of.store.branchName})`
          : of.store?.name || '',
        originalPrice: of.originalPrice,
        offerPrice: of.offerPrice,
        discountPercent: of.discountPercent,
        durationHours: of.durationHours,
        expiresAt: of.expiresAt,
        status: of.status,
        serviceFeeUsd: of.serviceFeeUsd,
        paymentMethod: of.paymentMethod || null,
        paymentReference: of.paymentReference || null,
        deepLinkUrl: of.deepLinkUrl,
        whatsappShareText: of.whatsappShareText,
        messageToCustomer: of.messageToCustomer || null,
        createdAt: of.createdAt,
      })),
    };
  }

  async cancelOffer(companyId: string, offerId: string, actor: any) {
    const access = await this.validateCrmAccess(actor, companyId, true);
    const stores = await this.getAuthorizedStores(companyId, access);
    const authorizedStoreIds = new Set(stores.map((s) => s.id));

    const offer = await this.offerRepository.findOne({
      where: { id: offerId, companyId },
    });
    if (!offer || !authorizedStoreIds.has(offer.storeId)) {
      throw new NotFoundException('Oferta CRM no encontrada');
    }

    if (offer.status !== CrmOfferStatus.ACTIVE) {
      throw new BadRequestException(
        `No se puede cancelar una oferta en estado ${offer.status}`,
      );
    }

    offer.status = CrmOfferStatus.CANCELLED;
    return this.offerRepository.save(offer);
  }

  /**
   * Resuelve una oferta pública/cliente por código sin filtrar PII ni datos internos del CRM.
   */
  async resolveOfferByCode(offerCode: string, currentUserId?: string) {
    const normalizedCode = String(offerCode || '').trim().toUpperCase();
    const offer = await this.offerRepository.findOne({
      where: { offerCode: normalizedCode },
      relations: ['item', 'store'],
    });

    if (!offer || !offer.item || offer.item.isDeleted) {
      throw new NotFoundException('Oferta especial no encontrada');
    }

    const now = new Date();
    if (offer.status === CrmOfferStatus.ACTIVE && offer.expiresAt <= now) {
      offer.status = CrmOfferStatus.EXPIRED;
      await this.offerRepository.save(offer);
    }

    const exchangeRate = await this.platformSettingsService.getExchangeRateConfig();
    const remainingSeconds = Math.max(
      0,
      Math.floor((offer.expiresAt.getTime() - now.getTime()) / 1000),
    );
    const expired =
      offer.status === CrmOfferStatus.EXPIRED || remainingSeconds <= 0;
    const cancelled = offer.status === CrmOfferStatus.CANCELLED;
    const redeemed = offer.status === CrmOfferStatus.REDEEMED;
    const isTargetCustomer =
      !currentUserId || currentUserId === offer.customerId;
    const valid =
      offer.status === CrmOfferStatus.ACTIVE &&
      !expired &&
      !cancelled &&
      !redeemed &&
      Boolean(offer.item.isActive) &&
      isTargetCustomer;

    return {
      valid,
      expired,
      cancelled,
      redeemed,
      isTargetCustomer,
      status: offer.status,
      offerCode: offer.offerCode,
      originalPrice: offer.originalPrice,
      offerPrice: offer.offerPrice,
      discountPercent: offer.discountPercent,
      durationHours: offer.durationHours,
      expiresAt: offer.expiresAt,
      remainingSeconds,
      messageToCustomer: offer.messageToCustomer || null,
      deepLinkUrl: offer.deepLinkUrl,
      exchangeRate,
      item: {
        id: offer.item.id,
        title: offer.item.title,
        description: offer.item.description,
        price: Number(offer.item.price || 0),
        discountPrice: offer.item.discountPrice ?? null,
        priceType: offer.item.priceType,
        mainImage: offer.item.mainImage || '',
        images: offer.item.images || [],
        itemType: offer.item.itemType,
        trackInventory: Boolean(offer.item.trackInventory),
        stockQuantity: Number(offer.item.stockQuantity || 0),
        requiresBooking: Boolean(offer.item.requiresBooking),
        bookingType: offer.item.bookingType,
        allowInstallments: Boolean(offer.item.allowInstallments),
        isActive: Boolean(offer.item.isActive),
        isAgeRestricted: Boolean(offer.item.isAgeRestricted),
        hasVariants: Boolean(offer.item.hasVariants),
      },
      store: {
        id: offer.store?.id || offer.storeId,
        name: offer.store?.name || '',
        branchName: offer.store?.branchName || null,
        logo: offer.store?.logo || '',
        slug: offer.store?.slug || '',
      },
    };
  }

  async buildOfferRedirectHtml(offerCode: string): Promise<string> {
    const resolved = await this.resolveOfferByCode(offerCode);
    const escapeHtml = (val: string) =>
      String(val || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

    const title = escapeHtml(
      `Oferta Especial -${resolved.discountPercent.toFixed(0)}%: ${resolved.item.title}`,
    );
    const description = escapeHtml(
      resolved.valid
        ? `Precio especial $${resolved.offerPrice.toFixed(2)} USD en ${resolved.store.name} (antes $${resolved.originalPrice.toFixed(2)}). ¡Tiempo limitado!`
        : `Revisa este producto en ${resolved.store.name} dentro de Tu Lojita.`,
    );
    const image = escapeHtml(resolved.item.mainImage || resolved.store.logo || '');
    const appUri = `tulojita://offer/${escapeHtml(resolved.offerCode)}`;

    return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${title}</title>
  <meta property="og:type" content="website" />
  <meta property="og:title" content="${title}" />
  <meta property="og:description" content="${description}" />
  ${image ? `<meta property="og:image" content="${image}" />` : ''}
  <style>
    body{font-family:system-ui,-apple-system,sans-serif;background:#0f172a;color:#f8fafc;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px;}
    .card{max-width:420px;width:100%;background:#1e293b;border-radius:20px;padding:24px;box-shadow:0 20px 50px rgba(0,0,0,.4);text-align:center;}
    img{width:100%;max-height:220px;object-fit:cover;border-radius:14px;margin-bottom:16px;}
    .badge{display:inline-block;background:#f59e0b;color:#0f172a;font-weight:700;padding:4px 12px;border-radius:999px;font-size:12px;margin-bottom:10px;}
    h1{font-size:20px;margin:0 0 8px;}
    p{font-size:14px;color:#cbd5e1;line-height:1.5;margin:0 0 20px;}
    .btn{display:block;background:#22c55e;color:#052e16;font-weight:700;text-decoration:none;padding:14px 20px;border-radius:12px;font-size:15px;}
  </style>
  <script>
    setTimeout(function(){ window.location.href = "${appUri}"; }, 180);
  </script>
</head>
<body>
  <div class="card">
    ${image ? `<img src="${image}" alt="${title}" />` : ''}
    <div class="badge">OFERTA ESPECIAL · ${escapeHtml(resolved.offerCode)}</div>
    <h1>${escapeHtml(resolved.item.title)}</h1>
    <p>${description}</p>
    <a class="btn" href="${appUri}">Abrir en Tu Lojita</a>
  </div>
</body>
</html>`;
  }

  /**
   * Valida una oferta CRM dirigida al momento de validar carrito o crear una orden.
   * Si es válida y [markRedeemed] es true, la marca como REDEEMED dentro de la transacción.
   */
  async resolveValidOfferForCustomerItem(
    offerCode: string | undefined,
    customerId: string | undefined,
    itemId: string,
    manager?: EntityManager,
    markRedeemed = false,
  ): Promise<number | null> {
    if (!offerCode || !offerCode.trim()) return null;
    const repo = manager
      ? manager.getRepository(CrmTargetedOffer)
      : this.offerRepository;
    const offer = await repo.findOne({
      where: { offerCode: offerCode.trim().toUpperCase() },
    });
    if (!offer || offer.itemId !== itemId) return null;
    if (customerId && offer.customerId !== customerId) return null;

    const now = new Date();
    if (offer.status === CrmOfferStatus.ACTIVE && offer.expiresAt <= now) {
      offer.status = CrmOfferStatus.EXPIRED;
      await repo.save(offer);
      return null;
    }

    if (offer.status !== CrmOfferStatus.ACTIVE) {
      return null;
    }

    if (markRedeemed) {
      offer.status = CrmOfferStatus.REDEEMED;
      await repo.save(offer);
    }

    return Number(offer.offerPrice);
  }
}
