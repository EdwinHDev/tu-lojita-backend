import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual } from 'typeorm';
import { Company } from './entities/company.entity';
import { Store } from 'src/store/entities/store.entity';
import { Order } from 'src/order/entities/order.entity';
import { User } from 'src/user/entities/user.entity';
import { Item } from 'src/item/entities/item.entity';
import { DashboardStatsDto } from './dto/dashboard-stats.dto';
import { RecentSalesResponseDto, RecentSaleDto } from './dto/recent-sales.dto';
import {
  StoresSummaryResponseDto,
  StoreSummaryDto,
} from './dto/stores-summary.dto';
import {
  CompanyStoresResponseDto,
  CompanyStoreDto,
} from './dto/company-stores.dto';
import { OrderStatus } from 'src/order/types';
import {
  getStartOfTodayInTimezone,
  getStartOfMonthInTimezone,
  formatTimeInTimezone,
  getLocalDate,
} from 'src/common/utils/timezone.utils';
import { resolveOrderItemImageUrl } from 'src/common/utils/order-item-image.utils';

import {
  DashboardAnalyticsQueryDto,
  DashboardAnalyticsResponseDto,
  DashboardPeriod,
  OperationalSummaryDto,
  PaymentMethodShareDto,
  SalesChartPointDto,
  StoreOperationalAlertDto,
  StorePerformanceDto,
  TopProductDto,
  TopDesiredProductDto,
} from './dto/dashboard-analytics.dto';
import { Payment } from 'src/payment/entities/payment.entity';
import { OrderItem } from 'src/order-item/entities/order-item.entity';
import { PaymentStatus } from 'src/payment/types/payment-status.enum';
import { PlatformSettingsService } from 'src/platform-settings/platform-settings.service';
import { StoreCommissionBilling } from 'src/commission/entities/store-commission-billing.entity';
import { CommissionPaymentReport } from 'src/commission/entities/commission-payment-report.entity';
import { PaymentReportStatus } from 'src/commission/types';
import { ItemPromotion } from 'src/item/entities/item-promotion.entity';
import { ItemPromotionStatus } from 'src/item/types/item-promotion-status.enum';
import { StoreRanking } from 'src/ranking/entities/store-ranking.entity';
import { DIVISION_TITLES, normalizeDivision } from 'src/ranking/types';
import { CompanyPermission } from './types/company-permission.enum';

@Injectable()
export class CompanyDashboardService {
  constructor(
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
    @InjectRepository(Store)
    private readonly storeRepository: Repository<Store>,
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Item)
    private readonly itemRepository: Repository<Item>,
    @InjectRepository(Payment)
    private readonly paymentRepository: Repository<Payment>,
    @InjectRepository(OrderItem)
    private readonly orderItemRepository: Repository<OrderItem>,
    @InjectRepository(StoreCommissionBilling)
    private readonly storeCommissionBillingRepository: Repository<StoreCommissionBilling>,
    @InjectRepository(CommissionPaymentReport)
    private readonly commissionPaymentReportRepository: Repository<CommissionPaymentReport>,
    @InjectRepository(ItemPromotion)
    private readonly itemPromotionRepository: Repository<ItemPromotion>,
    @InjectRepository(StoreRanking)
    private readonly storeRankingRepository: Repository<StoreRanking>,
    private readonly platformSettingsService: PlatformSettingsService,
  ) {}

  /**
   * Validar que el usuario pertenece a la empresa
   */
  private async validateUserCompany(
    actorOrUserId: any,
    companyId: string,
  ): Promise<{ allowedStoreIds?: string[] }> {
    if (typeof actorOrUserId === 'object' && actorOrUserId !== null) {
      if (actorOrUserId.role === 'ADMIN') {
        return {};
      }
      if (actorOrUserId.isCollaborator) {
        if (actorOrUserId.company?.id !== companyId) {
          throw new ForbiddenException('No tienes acceso a esta empresa');
        }
        if (!actorOrUserId.hasFullBranchAccess) {
          return { allowedStoreIds: actorOrUserId.allowedBranchIds || [] };
        }
        return {};
      }
      const userId = actorOrUserId.id;
      const company = await this.companyRepository.findOne({
        where: { id: companyId, owner: { id: userId } },
      });
      if (!company) {
        throw new ForbiddenException('No tienes acceso a esta empresa');
      }
      return {};
    }

    const userId = actorOrUserId;
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    // Verificar que la empresa existe y que el usuario es el owner
    const company = await this.companyRepository.findOne({
      where: {
        id: companyId,
        owner: { id: userId },
      },
    });

    if (!company) {
      throw new ForbiddenException('No tienes acceso a esta empresa');
    }

    return {};
  }

  /**
   * Obtener estadísticas del dashboard
   */
  async getDashboardStats(
    companyId: string,
    actor: any,
  ): Promise<DashboardStatsDto> {
    const { allowedStoreIds } = await this.validateUserCompany(actor, companyId);

    const company = await this.companyRepository.findOne({
      where: { id: companyId },
      relations: ['stores'],
    });

    if (!company) {
      throw new NotFoundException('Empresa no encontrada');
    }

    let activeStores = (company.stores || []).filter((s) => !s.isDeleted);
    if (allowedStoreIds) {
      activeStores = activeStores.filter((s) => allowedStoreIds.includes(s.id));
    }
    const storeIds = activeStores.map((store) => store.id);

    // Si no hay tiendas activas autorizadas, retornar estadísticas en 0
    if (storeIds.length === 0) {
      return {
        salesToday: {
          amount: 0,
          percentage: 0,
          currency: 'USD',
        },
        totalStores: {
          count: 0,
          newThisMonth: 0,
        },
        totalProducts: {
          count: 0,
          addedThisWeek: 0,
        },
        totalCustomers: {
          count: 0,
          newThisMonth: 0,
        },
      };
    }

    const canViewFinancial = this.canActorViewFinancialMetrics(actor);

    // Calcular fechas según la zona horaria de la primera tienda activa o Caracas por defecto
    const timezone = activeStores[0]?.timezone || 'America/Caracas';
    const startOfToday = getStartOfTodayInTimezone(new Date(), timezone);
    const startOfYesterday = new Date(startOfToday);
    startOfYesterday.setDate(startOfYesterday.getDate() - 1);

    const startOfWeek = new Date(startOfToday);
    startOfWeek.setDate(startOfToday.getDate() - 7);

    const startOfMonth = getStartOfMonthInTimezone(new Date(), timezone);

    // 1. Ventas de hoy y ayer (solo si tiene permiso financiero)
    const [salesToday, salesYesterday] = canViewFinancial
      ? await Promise.all([
          this.orderRepository
            .createQueryBuilder('order')
            .select('SUM(order.finalAmount)', 'total')
            .where('order.storeId IN (:...storeIds)', { storeIds })
            .andWhere('order.status IN (:...statuses)', {
              statuses: [OrderStatus.FULLY_PAID, OrderStatus.PARTIALLY_PAID],
            })
            .andWhere('order.createdAt >= :startOfToday', {
              startOfToday: startOfToday.toISOString(),
            })
            .getRawOne<{ total: string | null }>(),
          this.orderRepository
            .createQueryBuilder('order')
            .select('SUM(order.finalAmount)', 'total')
            .where('order.storeId IN (:...storeIds)', { storeIds })
            .andWhere('order.status IN (:...statuses)', {
              statuses: [OrderStatus.FULLY_PAID, OrderStatus.PARTIALLY_PAID],
            })
            .andWhere(
              'order.createdAt >= :startOfYesterday AND order.createdAt < :startOfToday',
              {
                startOfYesterday: startOfYesterday.toISOString(),
                startOfToday: startOfToday.toISOString(),
              },
            )
            .getRawOne<{ total: string | null }>(),
        ])
      : [null, null];

    const salesTodayAmount = canViewFinancial
      ? parseFloat(salesToday?.total || '0')
      : 0;
    const salesYesterdayAmount = canViewFinancial
      ? parseFloat(salesYesterday?.total || '0')
      : 0;
    const salesPercentage =
      canViewFinancial && salesYesterdayAmount > 0
        ? ((salesTodayAmount - salesYesterdayAmount) / salesYesterdayAmount) *
          100
        : 0;

    // 2. Total de tiendas activas autorizadas
    const totalStores = activeStores.length;
    const newStoresThisMonth = activeStores.filter(
      (s) => s.createdAt != null && new Date(s.createdAt) >= startOfMonth,
    ).length;

    // 3. Total de productos activos acotados estrictamente a storeIds
    const [totalProducts, newProductsThisWeek, customersQuery, newCustomersThisMonth] =
      await Promise.all([
        this.itemRepository
          .createQueryBuilder('item')
          .innerJoin('item.store', 'store')
          .where('store.id IN (:...storeIds)', { storeIds })
          .andWhere('item.isDeleted = false')
          .getCount(),
        this.itemRepository
          .createQueryBuilder('item')
          .innerJoin('item.store', 'store')
          .where('store.id IN (:...storeIds)', { storeIds })
          .andWhere('item.isDeleted = false')
          .andWhere('item.createdAt >= :startOfWeek', { startOfWeek })
          .getCount(),
        this.orderRepository
          .createQueryBuilder('order')
          .select('COUNT(DISTINCT order.userId)', 'total')
          .where('order.storeId IN (:...storeIds)', { storeIds })
          .getRawOne<{ total: string | null }>(),
        this.orderRepository
          .createQueryBuilder('order')
          .select('COUNT(DISTINCT order.userId)', 'total')
          .where('order.storeId IN (:...storeIds)', { storeIds })
          .andWhere('order.status IN (:...statuses)', {
            statuses: [OrderStatus.FULLY_PAID, OrderStatus.PARTIALLY_PAID],
          })
          .getRawOne<{ total: string | null }>(),
      ]);

    return {
      salesToday: {
        amount: Math.round(salesTodayAmount * 100) / 100,
        percentage: Math.round(salesPercentage * 10) / 10,
        currency: 'USD',
      },
      totalStores: {
        count: totalStores,
        newThisMonth: newStoresThisMonth,
      },
      totalProducts: {
        count: totalProducts,
        addedThisWeek: newProductsThisWeek,
      },
      totalCustomers: {
        count: parseInt(customersQuery?.total || '0'),
        newThisMonth: parseInt(newCustomersThisMonth?.total || '0'),
      },
    };
  }

  /**
   * Obtener ventas recientes
   */
  async getRecentSales(
    companyId: string,
    actor: any,
    limit: number = 5,
  ): Promise<RecentSalesResponseDto> {
    const { allowedStoreIds } = await this.validateUserCompany(actor, companyId);

    const company = await this.companyRepository.findOne({
      where: { id: companyId },
      relations: ['stores'],
    });

    if (!company) {
      throw new NotFoundException('Empresa no encontrada');
    }

    let storeIds = company.stores.map((store) => store.id);
    if (allowedStoreIds) {
      storeIds = storeIds.filter((id) => allowedStoreIds.includes(id));
    }

    // Si no hay tiendas, retornar array vacío
    if (storeIds.length === 0) {
      return {
        recentSales: [],
        total: 0,
      };
    }

    const orders = await this.orderRepository
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.store', 'store')
      .leftJoinAndSelect('order.orderItems', 'orderItem')
      .leftJoinAndSelect('orderItem.variant', 'variant')
      .leftJoinAndSelect('orderItem.item', 'item')
      .leftJoinAndSelect('item.variants', 'itemVariants')
      .where('order.storeId IN (:...storeIds)', { storeIds })
      .andWhere('order.status IN (:...statuses)', {
        statuses: [OrderStatus.FULLY_PAID, OrderStatus.PARTIALLY_PAID],
      })
      .orderBy('order.createdAt', 'DESC')
      .take(limit)
      .getMany();

    const recentSales: RecentSaleDto[] = orders.map((order) => {
      const timezone = order.store?.timezone || 'America/Caracas';
      const firstItem = order.orderItems?.[0];
      const itemImageUrl = resolveOrderItemImageUrl(firstItem) || undefined;
      const count = order.orderItems?.length || 0;
      const itemTitle =
        (firstItem?.title || firstItem?.item?.title || 'Producto') +
        (count > 1 ? ` (+${count - 1})` : '');

      return {
        id: order.id,
        storeName: order.store?.name || '',
        amount: parseFloat(order.finalAmount.toString()),
        currency: 'USD',
        time: formatTimeInTimezone(new Date(order.createdAt), timezone),
        orderId: order.id,
        status: order.status,
        itemTitle,
        itemImageUrl,
      };
    });

    return {
      recentSales,
      total: recentSales.length,
    };
  }

  /**
   * Obtener resumen de tiendas
   */
  async getStoresSummary(
    companyId: string,
    actor: any,
  ): Promise<StoresSummaryResponseDto> {
    const { allowedStoreIds } = await this.validateUserCompany(actor, companyId);

    let stores = await this.storeRepository.find({
      where: { company: { id: companyId }, isDeleted: false },
      relations: ['items', 'addresses', 'company'],
      order: { createdAt: 'DESC' },
    });

    if (allowedStoreIds) {
      stores = stores.filter((s) => allowedStoreIds.includes(s.id));
    }

    const totalCompanyStores = stores.length;
    const storesSummary: StoreSummaryDto[] = stores.map((store) => ({
      id: store.id,
      name: store.name,
      branchName: store.branchName,
      hasMultipleBranches: totalCompanyStores > 1,
      productsCount: store.items?.length || 0,
      address: store.addresses?.[0]?.address || undefined,
      logo: store.logo?.trim() || store.company?.logo?.trim() || '',
      instagram: store.instagram,
      tiktok: store.tiktok,
      phone: store.phone,
    }));

    return {
      stores: storesSummary,
      total: stores.length,
    };
  }

  /**
   * Obtener tiendas de la empresa con estadísticas
   */
  async getCompanyStores(
    companyId: string,
    actor: any,
  ): Promise<CompanyStoresResponseDto> {
    const { allowedStoreIds } = await this.validateUserCompany(actor, companyId);

    let stores = await this.storeRepository.find({
      where: { company: { id: companyId }, isDeleted: false },
      relations: ['items', 'addresses', 'aiSettings', 'company'],
      order: { createdAt: 'DESC' },
    });

    if (allowedStoreIds) {
      stores = stores.filter((s) => allowedStoreIds.includes(s.id));
    }

    if (stores.length === 0) {
      return {
        stores: [],
        total: 0,
      };
    }

    const storeIds = stores.map((s) => s.id);
    const canViewFinancial = this.canActorViewFinancialMetrics(actor);

    const [
      globalAiEnabled,
      pendingOrdersRows,
      pendingReportsRows,
      rankings,
    ] = await Promise.all([
      this.platformSettingsService.isAiImageEnhancementEnabled(),
      this.orderRepository
        .createQueryBuilder('order')
        .innerJoin('order.store', 'store')
        .select('store.id', 'storeId')
        .addSelect('COUNT(order.id)', 'cnt')
        .where('store.id IN (:...storeIds)', { storeIds })
        .andWhere('order.status IN (:...statuses)', {
          statuses: [OrderStatus.PENDING, OrderStatus.PARTIALLY_PAID],
        })
        .groupBy('store.id')
        .getRawMany<{ storeId: string; cnt: string }>(),
      canViewFinancial
        ? this.commissionPaymentReportRepository
            .createQueryBuilder('report')
            .innerJoin('report.billing', 'billing')
            .innerJoin('billing.store', 'store')
            .select('store.id', 'storeId')
            .addSelect('COUNT(report.id)', 'cnt')
            .where('store.id IN (:...storeIds)', { storeIds })
            .andWhere('report.status = :status', {
              status: PaymentReportStatus.PENDING_REVIEW,
            })
            .groupBy('store.id')
            .getRawMany<{ storeId: string; cnt: string }>()
        : Promise.resolve([]),
      this.storeRankingRepository
        .createQueryBuilder('ranking')
        .where('ranking.storeId IN (:...storeIds)', { storeIds })
        .getMany(),
    ]);

    const pendingOrdersAgg = this.groupGroupedCounts(pendingOrdersRows);
    const pendingReportsAgg = canViewFinancial
      ? this.groupGroupedCounts(pendingReportsRows)
      : { total: 0, byStore: new Map<string, number>() };
    const rankingByStoreId = new Map(rankings.map((r) => [r.storeId, r]));

    const totalCompanyStores = stores.length;
    const companyStores: CompanyStoreDto[] = await Promise.all(
      stores.map(async (store) => {
        const timezone = store.timezone || 'America/Caracas';
        const storeStartOfToday = getStartOfTodayInTimezone(
          new Date(),
          timezone,
        );

        const salesToday = canViewFinancial
          ? await this.orderRepository
              .createQueryBuilder('order')
              .select('SUM(order.finalAmount)', 'total')
              .where('order.storeId = :storeId', { storeId: store.id })
              .andWhere('order.status IN (:...statuses)', {
                statuses: [OrderStatus.FULLY_PAID, OrderStatus.PARTIALLY_PAID],
              })
              .andWhere('order.createdAt >= :startOfToday', {
                startOfToday: storeStartOfToday.toISOString(),
              })
              .getRawOne<{ total: string | null }>()
          : null;

        const salesTodayAmount = canViewFinancial
          ? Math.round(parseFloat(salesToday?.total || '0') * 100) / 100
          : 0;

        const commissionDebt =
          canViewFinancial && !store.isCommissionExempt
            ? Math.round(
                parseFloat(
                  store.accumulatedCommissionDebt?.toString() || '0',
                ) * 100,
              ) / 100
            : 0;

        const ranking = rankingByStoreId.get(store.id);
        let rankingDivisionTitle: string | null = null;
        let currentPR = 0;
        let consecutiveSalesDays = 0;
        let inDangerZone = false;

        if (ranking) {
          const normalized = normalizeDivision(ranking.division);
          rankingDivisionTitle = DIVISION_TITLES[normalized] || normalized;
          currentPR = Number(ranking.currentPR || 0);
          consecutiveSalesDays = Number(ranking.consecutiveSalesDays || 0);
          inDangerZone = Boolean(ranking.inDangerZone || ranking.isFlagged);
        }

        return {
          id: store.id,
          name: store.name,
          branchName: store.branchName,
          hasMultipleBranches: totalCompanyStores > 1,
          address: store.addresses?.[0]?.address || undefined,
          logo: store.logo?.trim() || store.company?.logo?.trim() || '',
          status: store.status,
          productsCount: (store.items || []).filter((i) => !i.isDeleted).length,
          salesToday: salesTodayAmount,
          currency: 'USD',
          instagram: store.instagram,
          tiktok: store.tiktok,
          phone: store.phone,
          deletionScheduledAt: store.deletionScheduledAt,
          isDeleted: store.isDeleted,
          aiEnabled: Boolean(
            globalAiEnabled &&
              store.aiSettings?.isEnabled &&
              store.aiSettings?.apiKeyHint,
          ),
          pendingOrdersCount: pendingOrdersAgg.byStore.get(store.id) || 0,
          commissionDebt,
          pendingCommissionReportsCount: canViewFinancial
            ? pendingReportsAgg.byStore.get(store.id) || 0
            : 0,
          rankingDivisionTitle,
          currentPR,
          consecutiveSalesDays,
          inDangerZone,
        };
      }),
    );

    return {
      stores: companyStores,
      total: stores.length,
    };
  }

  /**
   * Obtener analítica integral en tiempo real con filtros de fecha y sucursal
   */
  async getAnalytics(
    companyId: string,
    actor: any,
    queryDto: DashboardAnalyticsQueryDto,
  ): Promise<DashboardAnalyticsResponseDto> {
    const { allowedStoreIds } = await this.validateUserCompany(actor, companyId);

    if (
      queryDto.storeId &&
      queryDto.storeId !== 'all' &&
      allowedStoreIds &&
      !allowedStoreIds.includes(queryDto.storeId)
    ) {
      throw new ForbiddenException(
        'No tienes autorización para consultar analíticas de esta sucursal',
      );
    }

    const company = await this.companyRepository.findOne({
      where: { id: companyId },
      relations: ['stores'],
    });

    if (!company) {
      throw new NotFoundException('Empresa no encontrada');
    }

    let targetStores: Store[] = company.stores || [];
    if (allowedStoreIds) {
      targetStores = targetStores.filter((s) => allowedStoreIds.includes(s.id));
    }

    if (queryDto.storeId && queryDto.storeId !== 'all') {
      targetStores = targetStores.filter((s) => s.id === queryDto.storeId);
      if (targetStores.length === 0) {
        throw new NotFoundException('Sucursal no encontrada en esta empresa');
      }
    }

    const targetStoreIds = targetStores.map((s) => s.id);
    const timezone = company.stores[0]?.timezone || 'America/Caracas';

    const period = queryDto.period || DashboardPeriod.MONTH;
    const now = new Date();

    let startDate: Date;
    let endDate: Date;
    let prevStartDate: Date;
    let prevEndDate: Date;

    if (
      period === DashboardPeriod.CUSTOM &&
      queryDto.startDate &&
      queryDto.endDate
    ) {
      startDate = new Date(queryDto.startDate);
      endDate = new Date(queryDto.endDate);
      const duration = endDate.getTime() - startDate.getTime();
      prevStartDate = new Date(startDate.getTime() - duration);
      prevEndDate = new Date(startDate.getTime());
    } else if (period === DashboardPeriod.TODAY) {
      startDate = getStartOfTodayInTimezone(now, timezone);
      endDate = new Date(startDate.getTime() + 24 * 60 * 60 * 1000 - 1);
      prevStartDate = new Date(startDate.getTime() - 24 * 60 * 60 * 1000);
      prevEndDate = new Date(startDate.getTime() - 1);
    } else if (period === DashboardPeriod.WEEK) {
      const todayStart = getStartOfTodayInTimezone(now, timezone);
      startDate = new Date(todayStart.getTime() - 6 * 24 * 60 * 60 * 1000);
      endDate = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000 - 1);
      prevStartDate = new Date(startDate.getTime() - 7 * 24 * 60 * 60 * 1000);
      prevEndDate = new Date(startDate.getTime() - 1);
    } else if (period === DashboardPeriod.SIX_MONTHS) {
      const todayStart = getStartOfTodayInTimezone(now, timezone);
      startDate = new Date(todayStart.getTime() - 180 * 24 * 60 * 60 * 1000);
      endDate = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000 - 1);
      prevStartDate = new Date(startDate.getTime() - 180 * 24 * 60 * 60 * 1000);
      prevEndDate = new Date(startDate.getTime() - 1);
    } else if (period === DashboardPeriod.YEAR) {
      const todayStart = getStartOfTodayInTimezone(now, timezone);
      startDate = new Date(todayStart.getTime() - 365 * 24 * 60 * 60 * 1000);
      endDate = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000 - 1);
      prevStartDate = new Date(startDate.getTime() - 365 * 24 * 60 * 60 * 1000);
      prevEndDate = new Date(startDate.getTime() - 1);
    } else {
      // Default: MONTH (30 days)
      const todayStart = getStartOfTodayInTimezone(now, timezone);
      startDate = new Date(todayStart.getTime() - 29 * 24 * 60 * 60 * 1000);
      endDate = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000 - 1);
      prevStartDate = new Date(startDate.getTime() - 30 * 24 * 60 * 60 * 1000);
      prevEndDate = new Date(startDate.getTime() - 1);
    }

    if (targetStoreIds.length === 0) {
      return {
        period,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        storeId: queryDto.storeId || 'all',
        currency: 'USD',
        kpis: {
          totalSales: 0,
          totalCollected: 0,
          accountsReceivable: 0,
          totalOrders: 0,
          completedOrders: 0,
          pendingOrders: 0,
          averageTicket: 0,
          installmentRatio: {
            installmentOrdersCount: 0,
            singlePaymentOrdersCount: 0,
            installmentPercentage: 0,
            singlePaymentPercentage: 0,
          },
          growth: { salesGrowthPercentage: 0, ordersGrowthPercentage: 0 },
        },
        salesChart: [],
        storesPerformance: [],
        topProducts: [],
        topDesiredProducts: [],
        paymentMethods: [],
        operationalSummary: this.emptyOperationalSummary(),
      };
    }

    const activeTargetStores = targetStores.filter((s) => !s.isDeleted);
    const canViewFinancial = this.canActorViewFinancialMetrics(actor);
    const operationalQueriesPromise = this.fetchOperationalSummaryQueries(
      activeTargetStores,
      canViewFinancial,
    );

    // 1. Órdenes del período actual
    const currentOrders = await this.orderRepository
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.store', 'store')
      .where('order.storeId IN (:...targetStoreIds)', { targetStoreIds })
      .andWhere(
        'order.createdAt >= :startDate AND order.createdAt <= :endDate',
        {
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
        },
      )
      .orderBy('order.createdAt', 'ASC')
      .getMany();

    // 2. Órdenes del período anterior para calcular crecimiento
    const prevOrders = await this.orderRepository
      .createQueryBuilder('order')
      .where('order.storeId IN (:...targetStoreIds)', { targetStoreIds })
      .andWhere(
        'order.createdAt >= :prevStartDate AND order.createdAt <= :prevEndDate',
        {
          prevStartDate: prevStartDate.toISOString(),
          prevEndDate: prevEndDate.toISOString(),
        },
      )
      .getMany();

    const validCurrentOrders = currentOrders.filter(
      (o) =>
        o.status !== OrderStatus.CANCELLED && o.status !== OrderStatus.REJECTED,
    );
    const validPrevOrders = prevOrders.filter(
      (o) =>
        o.status !== OrderStatus.CANCELLED && o.status !== OrderStatus.REJECTED,
    );

    const totalSales =
      Math.round(
        validCurrentOrders.reduce(
          (sum, o) => sum + parseFloat(o.finalAmount?.toString() || '0'),
          0,
        ) * 100,
      ) / 100;

    const prevSales =
      Math.round(
        validPrevOrders.reduce(
          (sum, o) => sum + parseFloat(o.finalAmount?.toString() || '0'),
          0,
        ) * 100,
      ) / 100;

    // 3. Pagos efectivamente aprobados en el período
    const paymentsInRange = await this.paymentRepository
      .createQueryBuilder('payment')
      .where('payment.storeId IN (:...targetStoreIds)', { targetStoreIds })
      .andWhere('payment.status = :status', { status: PaymentStatus.APPROVED })
      .andWhere(
        'payment.createdAt >= :startDate AND payment.createdAt <= :endDate',
        {
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
        },
      )
      .getMany();

    const totalCollected =
      Math.round(
        paymentsInRange.reduce(
          (sum, p) => sum + parseFloat(p.amount?.toString() || '0'),
          0,
        ) * 100,
      ) / 100;

    // 4. Cuentas por cobrar activas (saldo de compras en cuotas vigentes)
    const activeInstallmentOrders = await this.orderRepository
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.store', 'store')
      .where('order.storeId IN (:...targetStoreIds)', { targetStoreIds })
      .andWhere('order.isPartialPayment = true')
      .andWhere('order.status IN (:...statuses)', {
        statuses: [OrderStatus.PARTIALLY_PAID, OrderStatus.PENDING],
      })
      .getMany();

    const accountsReceivable =
      Math.round(
        activeInstallmentOrders.reduce(
          (sum, o) => sum + parseFloat(o.remainingBalance?.toString() || '0'),
          0,
        ) * 100,
      ) / 100;

    // 5. Métricas de órdenes y ratios
    const totalOrders = currentOrders.length;
    const completedOrders = currentOrders.filter(
      (o) => o.status === OrderStatus.FULLY_PAID,
    ).length;
    const pendingOrders = currentOrders.filter(
      (o) =>
        o.status === OrderStatus.PENDING ||
        o.status === OrderStatus.PARTIALLY_PAID,
    ).length;

    const averageTicket =
      validCurrentOrders.length > 0
        ? Math.round((totalSales / validCurrentOrders.length) * 100) / 100
        : 0;

    const installmentOrdersCount = validCurrentOrders.filter(
      (o) => o.isPartialPayment,
    ).length;
    const singlePaymentOrdersCount = validCurrentOrders.filter(
      (o) => !o.isPartialPayment,
    ).length;
    const installmentPercentage =
      validCurrentOrders.length > 0
        ? Math.round(
            (installmentOrdersCount / validCurrentOrders.length) * 1000,
          ) / 10
        : 0;
    const singlePaymentPercentage =
      validCurrentOrders.length > 0
        ? Math.round(
            (singlePaymentOrdersCount / validCurrentOrders.length) * 1000,
          ) / 10
        : 0;

    const salesGrowthPercentage =
      prevSales > 0
        ? Math.round(((totalSales - prevSales) / prevSales) * 1000) / 10
        : totalSales > 0
          ? 100
          : 0;

    const ordersGrowthPercentage =
      prevOrders.length > 0
        ? Math.round(
            ((totalOrders - prevOrders.length) / prevOrders.length) * 1000,
          ) / 10
        : totalOrders > 0
          ? 100
          : 0;

    // 6. Puntos del gráfico de ventas
    const salesChart: SalesChartPointDto[] = [];
    if (period === DashboardPeriod.TODAY) {
      // 12 puntos de 2 horas (00:00, 02:00, ...)
      for (let h = 0; h < 24; h += 2) {
        const bucketStart = new Date(startDate.getTime() + h * 60 * 60 * 1000);
        const bucketEnd = new Date(
          startDate.getTime() + (h + 2) * 60 * 60 * 1000,
        );
        const bucketOrders = validCurrentOrders.filter(
          (o) => o.createdAt >= bucketStart && o.createdAt < bucketEnd,
        );
        const bucketSales = bucketOrders.reduce(
          (s, o) => s + parseFloat(o.finalAmount?.toString() || '0'),
          0,
        );
        salesChart.push({
          label: `${h.toString().padStart(2, '0')}:00`,
          date: bucketStart.toISOString(),
          sales: Math.round(bucketSales * 100) / 100,
          ordersCount: bucketOrders.length,
        });
      }
    } else if (
      period === DashboardPeriod.SIX_MONTHS ||
      period === DashboardPeriod.YEAR
    ) {
      // Agrupación mensual
      const monthsMap = new Map<
        string,
        { label: string; sales: number; count: number }
      >();
      const monthNames = [
        'Ene',
        'Feb',
        'Mar',
        'Abr',
        'May',
        'Jun',
        'Jul',
        'Ago',
        'Sep',
        'Oct',
        'Nov',
        'Dic',
      ];
      for (const o of validCurrentOrders) {
        const d = new Date(o.createdAt);
        const key = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`;
        const label = `${monthNames[d.getMonth()]} ${d.getFullYear().toString().substring(2)}`;
        const existing = monthsMap.get(key) || { label, sales: 0, count: 0 };
        existing.sales += parseFloat(o.finalAmount?.toString() || '0');
        existing.count += 1;
        monthsMap.set(key, existing);
      }
      for (const [dateKey, val] of monthsMap.entries()) {
        salesChart.push({
          label: val.label,
          date: `${dateKey}-01`,
          sales: Math.round(val.sales * 100) / 100,
          ordersCount: val.count,
        });
      }
    } else {
      // Agrupación diaria (Días del período)
      const dayMap = new Map<
        string,
        { label: string; sales: number; count: number }
      >();
      const dayDiff = Math.max(
        1,
        Math.ceil(
          (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24),
        ),
      );
      const step = dayDiff > 31 ? Math.ceil(dayDiff / 15) : 1;

      for (let i = 0; i < dayDiff; i += step) {
        const d = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000);
        const key = d.toISOString().split('T')[0];
        const dayNum = d.getDate();
        const monthNum = d.getMonth() + 1;
        dayMap.set(key, { label: `${dayNum}/${monthNum}`, sales: 0, count: 0 });
      }

      for (const o of validCurrentOrders) {
        const key = new Date(o.createdAt).toISOString().split('T')[0];
        if (dayMap.has(key)) {
          const entry = dayMap.get(key)!;
          entry.sales += parseFloat(o.finalAmount?.toString() || '0');
          entry.count += 1;
        }
      }

      for (const [k, v] of dayMap.entries()) {
        salesChart.push({
          label: v.label,
          date: k,
          sales: Math.round(v.sales * 100) / 100,
          ordersCount: v.count,
        });
      }
    }

    // 7. Rendimiento por Sucursal
    const storesPerformance: StorePerformanceDto[] = targetStores.map((st) => {
      const stOrders = validCurrentOrders.filter((o) => o.store?.id === st.id);
      const stSales =
        Math.round(
          stOrders.reduce(
            (sum, o) => sum + parseFloat(o.finalAmount?.toString() || '0'),
            0,
          ) * 100,
        ) / 100;
      const pct =
        totalSales > 0 ? Math.round((stSales / totalSales) * 1000) / 10 : 0;
      return {
        storeId: st.id,
        storeName: st.name + (st.branchName ? ` (${st.branchName})` : ''),
        totalSales: stSales,
        ordersCount: stOrders.length,
        percentageOfTotal: pct,
      };
    });
    storesPerformance.sort((a, b) => b.totalSales - a.totalSales);

    // 8. Top 5 Productos más vendidos
    let topProducts: TopProductDto[] = [];
    try {
      const topItemsRaw = await this.orderItemRepository
        .createQueryBuilder('oi')
        .innerJoin('oi.order', 'order')
        .leftJoin('order.store', 'orderStore')
        .leftJoin('oi.item', 'item')
        .leftJoin('item.store', 'itemStore')
        .select('oi.title', 'title')
        .addSelect('item.id', 'itemId')
        .addSelect('item.mainImage', 'mainImage')
        .addSelect('itemStore.id', 'itemStoreId')
        .addSelect('itemStore.name', 'itemStoreName')
        .addSelect('itemStore.branchName', 'itemStoreBranchName')
        .addSelect('orderStore.id', 'orderStoreId')
        .addSelect('orderStore.name', 'orderStoreName')
        .addSelect('orderStore.branchName', 'orderStoreBranchName')
        .addSelect('SUM(oi.quantity)', 'unitsSold')
        .addSelect('SUM(oi.price * oi.quantity)', 'totalRevenue')
        .where('order.storeId IN (:...targetStoreIds)', { targetStoreIds })
        .andWhere('order.status NOT IN (:...excluded)', {
          excluded: [OrderStatus.CANCELLED, OrderStatus.REJECTED],
        })
        .andWhere(
          'order.createdAt >= :startDate AND order.createdAt <= :endDate',
          {
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString(),
          },
        )
        .groupBy('oi.title')
        .addGroupBy('item.id')
        .addGroupBy('item.mainImage')
        .addGroupBy('itemStore.id')
        .addGroupBy('itemStore.name')
        .addGroupBy('itemStore.branchName')
        .addGroupBy('orderStore.id')
        .addGroupBy('orderStore.name')
        .addGroupBy('orderStore.branchName')
        .orderBy('SUM(oi.quantity)', 'DESC')
        .limit(5)
        .getRawMany();

      topProducts = topItemsRaw.map((raw) => {
        const resolvedStoreId = raw.itemStoreId || raw.orderStoreId || null;
        const baseName = raw.itemStoreName || raw.orderStoreName || null;
        const branchName =
          raw.itemStoreBranchName || raw.orderStoreBranchName || null;
        const resolvedStoreName = baseName
          ? baseName + (branchName ? ` (${branchName})` : '')
          : null;

        return {
          itemId: raw.itemId || '',
          title: raw.title || 'Producto',
          mainImage: raw.mainImage || null,
          unitsSold: parseInt(raw.unitsSold || '0', 10),
          totalRevenue:
            Math.round(parseFloat(raw.totalRevenue || '0') * 100) / 100,
          storeId: resolvedStoreId,
          storeName: resolvedStoreName,
        };
      });
    } catch {
      topProducts = [];
    }

    // 9. Distribución de Métodos de Pago
    const paymentMethodsMap = new Map<
      string,
      { label: string; amount: number; count: number }
    >();
    for (const p of paymentsInRange) {
      const m = p.paymentMethod || 'OTRO';
      let label = m;
      if (m === 'PAGO_MOVIL') label = 'Pago Móvil';
      else if (m === 'TRANSFER') label = 'Transferencia';
      else if (m === 'BINANCE') label = 'Binance Pay';
      else if (m === 'ZELLE') label = 'Zelle';

      const existing = paymentMethodsMap.get(m) || {
        label,
        amount: 0,
        count: 0,
      };
      existing.amount += parseFloat(p.amount?.toString() || '0');
      existing.count += 1;
      paymentMethodsMap.set(m, existing);
    }

    const paymentMethods: PaymentMethodShareDto[] = [];
    for (const [k, v] of paymentMethodsMap.entries()) {
      const amt = Math.round(v.amount * 100) / 100;
      const pct =
        totalCollected > 0 ? Math.round((amt / totalCollected) * 1000) / 10 : 0;
      paymentMethods.push({
        method: k,
        label: v.label,
        totalAmount: amt,
        percentage: pct,
        transactionCount: v.count,
      });
    }
    paymentMethods.sort((a, b) => b.totalAmount - a.totalAmount);

    // 9. Top 5 Artículos más deseados (con más favoritos)
    let topDesiredProducts: TopDesiredProductDto[] = [];
    try {
      const topDesiredRaw = await this.itemRepository
        .createQueryBuilder('item')
        .leftJoinAndSelect('item.store', 'store')
        .leftJoinAndSelect('item.variants', 'variants')
        .where('item.storeId IN (:...targetStoreIds)', { targetStoreIds })
        .andWhere('item.isActive = true')
        .andWhere('item.favoritesCount > 0')
        .orderBy('item.favoritesCount', 'DESC')
        .limit(5)
        .getMany();

      topDesiredProducts = topDesiredRaw.map((it) => {
        let stock: number | null = null;
        if (it.hasVariants) {
          stock = (it.variants || [])
            .filter((v) => v.isActive)
            .reduce(
              (sum, v) => sum + parseFloat(v.stockQuantity?.toString() || '0'),
              0,
            );
        } else if (it.stockQuantity != null) {
          stock = Number(it.stockQuantity);
        }

        return {
          itemId: it.id,
          title: it.title,
          mainImage: it.mainImage || null,
          favoritesCount: Number(it.favoritesCount || 0),
          price: Number(it.discountPrice ?? it.price),
          stockQuantity: stock,
          trackInventory: it.trackInventory,
          hasVariants: it.hasVariants || false,
          storeId: it.store?.id || null,
          storeName: it.store
            ? it.store.name +
              (it.store.branchName ? ` (${it.store.branchName})` : '')
            : null,
        };
      });
    } catch (err) {
      console.error('Error fetching top desired products:', err);
    }

    const operationalQueries = await operationalQueriesPromise;
    const operationalSummary = this.composeOperationalSummary(
      activeTargetStores,
      canViewFinancial,
      operationalQueries,
      currentOrders,
      activeInstallmentOrders,
    );

    return {
      period,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      storeId: queryDto.storeId || 'all',
      currency: 'USD',
      kpis: {
        totalSales,
        totalCollected,
        accountsReceivable,
        totalOrders,
        completedOrders,
        pendingOrders,
        averageTicket,
        installmentRatio: {
          installmentOrdersCount,
          singlePaymentOrdersCount,
          installmentPercentage,
          singlePaymentPercentage,
        },
        growth: {
          salesGrowthPercentage,
          ordersGrowthPercentage,
        },
      },
      salesChart,
      storesPerformance,
      topProducts,
      topDesiredProducts,
      paymentMethods,
      operationalSummary,
    };
  }

  private canActorViewFinancialMetrics(actor: any): boolean {
    if (!actor || typeof actor !== 'object') return true;
    if (!actor.isCollaborator) return true;
    const perms: string[] = Array.isArray(actor.permissions)
      ? actor.permissions
      : [];
    return perms.includes(CompanyPermission.METRICS_VIEW_FINANCIAL);
  }

  private formatStoreDisplayName(store: Store): string {
    return store.name + (store.branchName ? ` (${store.branchName})` : '');
  }

  private groupGroupedCounts(
    rows: Array<{ storeId?: string | null; cnt?: string | number | null }>,
  ): { total: number; byStore: Map<string, number> } {
    const byStore = new Map<string, number>();
    let total = 0;
    for (const row of rows) {
      const storeId = row?.storeId;
      const count = parseInt(String(row?.cnt ?? '0'), 10) || 0;
      total += count;
      if (storeId) {
        byStore.set(storeId, (byStore.get(storeId) || 0) + count);
      }
    }
    return { total, byStore };
  }

  private emptyOperationalSummary(): OperationalSummaryDto {
    return {
      totalCommissionDebt: 0,
      storesWithDebtCount: 0,
      pendingCommissionReportsCount: 0,
      activePromotionsCount: 0,
      pendingPromotionsCount: 0,
      topDivision: null,
      topDivisionTitle: null,
      highestPR: 0,
      maxConsecutiveSalesDays: 0,
      dailyMissionsCompletedToday: 0,
      storesInDangerZoneCount: 0,
      storesScheduledForDeletionCount: 0,
      storeAlerts: [],
      topRankingStoreId: null,
      topRankingStoreName: null,
    };
  }

  private async fetchOperationalSummaryQueries(
    activeTargetStores: Store[],
    canViewFinancial: boolean,
  ): Promise<{
    pendingReportsRows: Array<{ storeId: string; cnt: string }>;
    activePromosRows: Array<{ storeId: string; cnt: string }>;
    pendingPromosRows: Array<{ storeId: string; cnt: string }>;
    rankings: StoreRanking[];
  }> {
    if (activeTargetStores.length === 0) {
      return {
        pendingReportsRows: [],
        activePromosRows: [],
        pendingPromosRows: [],
        rankings: [],
      };
    }

    const now = new Date();
    const activeStoreIds = activeTargetStores.map((s) => s.id);

    const [pendingReportsRows, activePromosRows, pendingPromosRows, rankings] =
      await Promise.all([
        canViewFinancial
          ? this.commissionPaymentReportRepository
              .createQueryBuilder('report')
              .innerJoin('report.billing', 'billing')
              .innerJoin('billing.store', 'store')
              .select('store.id', 'storeId')
              .addSelect('COUNT(report.id)', 'cnt')
              .where('store.id IN (:...activeStoreIds)', { activeStoreIds })
              .andWhere('report.status = :status', {
                status: PaymentReportStatus.PENDING_REVIEW,
              })
              .groupBy('store.id')
              .getRawMany<{ storeId: string; cnt: string }>()
          : Promise.resolve([]),
        this.itemPromotionRepository
          .createQueryBuilder('promo')
          .select('promo.storeId', 'storeId')
          .addSelect('COUNT(promo.id)', 'cnt')
          .where('promo.storeId IN (:...activeStoreIds)', { activeStoreIds })
          .andWhere('promo.status = :status', {
            status: ItemPromotionStatus.APPROVED,
          })
          .andWhere('(promo.expiresAt IS NULL OR promo.expiresAt > :now)', {
            now,
          })
          .groupBy('promo.storeId')
          .getRawMany<{ storeId: string; cnt: string }>(),
        this.itemPromotionRepository
          .createQueryBuilder('promo')
          .select('promo.storeId', 'storeId')
          .addSelect('COUNT(promo.id)', 'cnt')
          .where('promo.storeId IN (:...activeStoreIds)', { activeStoreIds })
          .andWhere('promo.status = :status', {
            status: ItemPromotionStatus.PENDING,
          })
          .groupBy('promo.storeId')
          .getRawMany<{ storeId: string; cnt: string }>(),
        this.storeRankingRepository
          .createQueryBuilder('ranking')
          .where('ranking.storeId IN (:...activeStoreIds)', { activeStoreIds })
          .getMany(),
      ]);

    return {
      pendingReportsRows,
      activePromosRows,
      pendingPromosRows,
      rankings,
    };
  }

  private composeOperationalSummary(
    activeTargetStores: Store[],
    canViewFinancial: boolean,
    queries: {
      pendingReportsRows: Array<{ storeId: string; cnt: string }>;
      activePromosRows: Array<{ storeId: string; cnt: string }>;
      pendingPromosRows: Array<{ storeId: string; cnt: string }>;
      rankings: StoreRanking[];
    },
    currentOrders: Order[],
    activeInstallmentOrders: Order[],
  ): OperationalSummaryDto {
    if (activeTargetStores.length === 0) {
      return this.emptyOperationalSummary();
    }

    const now = new Date();
    const storeById = new Map(activeTargetStores.map((s) => [s.id, s]));
    const storeTimezoneMap = new Map(
      activeTargetStores.map((s) => [s.id, s.timezone || 'America/Caracas']),
    );

    const nonExemptStores = activeTargetStores.filter(
      (s) => !s.isCommissionExempt,
    );
    const totalCommissionDebt = canViewFinancial
      ? Math.round(
          nonExemptStores.reduce(
            (sum, s) =>
              sum + parseFloat(s.accumulatedCommissionDebt?.toString() || '0'),
            0,
          ) * 100,
        ) / 100
      : 0;
    const storesWithDebtCount = canViewFinancial
      ? nonExemptStores.filter(
          (s) =>
            parseFloat(s.accumulatedCommissionDebt?.toString() || '0') > 0,
        ).length
      : 0;

    const storesScheduledForDeletionCount = activeTargetStores.filter(
      (s) =>
        s.deletionScheduledAt != null &&
        new Date(s.deletionScheduledAt) > now,
    ).length;

    const pendingReportsAgg = canViewFinancial
      ? this.groupGroupedCounts(queries.pendingReportsRows)
      : { total: 0, byStore: new Map<string, number>() };
    const activePromosAgg = this.groupGroupedCounts(queries.activePromosRows);
    const pendingPromosAgg = this.groupGroupedCounts(queries.pendingPromosRows);

    const pendingOrdersMap = new Map<string, number>();
    for (const order of currentOrders) {
      if (
        order.status === OrderStatus.PENDING ||
        order.status === OrderStatus.PARTIALLY_PAID
      ) {
        const orderStoreId = order.store?.id || (order as any).storeId;
        if (orderStoreId) {
          pendingOrdersMap.set(
            orderStoreId,
            (pendingOrdersMap.get(orderStoreId) || 0) + 1,
          );
        }
      }
    }

    const receivablesMap = new Map<string, number>();
    if (canViewFinancial) {
      for (const order of activeInstallmentOrders) {
        const orderStoreId = order.store?.id || (order as any).storeId;
        if (orderStoreId) {
          const bal = parseFloat(order.remainingBalance?.toString() || '0');
          receivablesMap.set(
            orderStoreId,
            (receivablesMap.get(orderStoreId) || 0) + bal,
          );
        }
      }
    }

    const storeAlerts: StoreOperationalAlertDto[] = activeTargetStores.map(
      (st) => {
        const commissionDebt =
          canViewFinancial && !st.isCommissionExempt
            ? Math.round(
                parseFloat(st.accumulatedCommissionDebt?.toString() || '0') *
                  100,
              ) / 100
            : 0;
        const accountsReceivable = canViewFinancial
          ? Math.round((receivablesMap.get(st.id) || 0) * 100) / 100
          : 0;
        const isScheduledForDeletion =
          st.deletionScheduledAt != null &&
          new Date(st.deletionScheduledAt) > now;

        return {
          storeId: st.id,
          storeName: this.formatStoreDisplayName(st),
          pendingOrders: pendingOrdersMap.get(st.id) || 0,
          accountsReceivable,
          commissionDebt,
          pendingCommissionReportsCount: canViewFinancial
            ? pendingReportsAgg.byStore.get(st.id) || 0
            : 0,
          activePromotionsCount: activePromosAgg.byStore.get(st.id) || 0,
          pendingPromotionsCount: pendingPromosAgg.byStore.get(st.id) || 0,
          isScheduledForDeletion,
        };
      },
    );

    let topDivision: string | null = null;
    let topDivisionTitle: string | null = null;
    let highestPR = 0;
    let maxConsecutiveSalesDays = 0;
    let dailyMissionsCompletedToday = 0;
    let storesInDangerZoneCount = 0;
    let topRankingStoreId: string | null = null;
    let topRankingStoreName: string | null = null;

    if (queries.rankings.length > 0) {
      let bestRanking = queries.rankings[0];
      for (const ranking of queries.rankings) {
        const pr = Number(ranking.currentPR || 0);
        if (pr > Number(bestRanking.currentPR || 0)) {
          bestRanking = ranking;
        }
        const streak = Number(ranking.consecutiveSalesDays || 0);
        if (streak > maxConsecutiveSalesDays) {
          maxConsecutiveSalesDays = streak;
        }
        if (ranking.inDangerZone || ranking.isFlagged) {
          storesInDangerZoneCount += 1;
        }
        if (ranking.lastMissionDate) {
          const tz = storeTimezoneMap.get(ranking.storeId) || 'America/Caracas';
          const missionDay = getLocalDate(new Date(ranking.lastMissionDate), tz);
          const today = getLocalDate(now, tz);
          if (
            missionDay.year === today.year &&
            missionDay.month === today.month &&
            missionDay.day === today.day
          ) {
            dailyMissionsCompletedToday += Number(
              ranking.dailyMissionsCompletedToday || 0,
            );
          }
        }
      }

      const normalized = normalizeDivision(bestRanking.division);
      topDivision = normalized;
      topDivisionTitle = DIVISION_TITLES[normalized] || normalized;
      highestPR = Number(bestRanking.currentPR || 0);
      topRankingStoreId = bestRanking.storeId || null;
      const topStore = topRankingStoreId
        ? storeById.get(topRankingStoreId)
        : undefined;
      topRankingStoreName = topStore
        ? this.formatStoreDisplayName(topStore)
        : null;
    }

    return {
      totalCommissionDebt,
      storesWithDebtCount,
      pendingCommissionReportsCount: pendingReportsAgg.total,
      activePromotionsCount: activePromosAgg.total,
      pendingPromotionsCount: pendingPromosAgg.total,
      topDivision,
      topDivisionTitle,
      highestPR,
      maxConsecutiveSalesDays,
      dailyMissionsCompletedToday,
      storesInDangerZoneCount,
      storesScheduledForDeletionCount,
      storeAlerts,
      topRankingStoreId,
      topRankingStoreName,
    };
  }
}
