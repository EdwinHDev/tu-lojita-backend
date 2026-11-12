jest.mock('@nestjs/common/utils/load-package.util', () => ({
  loadPackage: (pkg: string) => require(pkg),
}));
jest.mock('@nestjs/typeorm', () => ({
  InjectRepository: () => () => {},
}));

import { ForbiddenException } from '@nestjs/common';
import { CompanyDashboardService } from './company-dashboard.service';
import { CompanyPermission } from './types/company-permission.enum';
import { DashboardPeriod } from './dto/dashboard-analytics.dto';
import { OrderStatus } from 'src/order/types';
import { Division } from 'src/ranking/types';

function createQueryBuilderMock({
  many = [] as any[],
  count = 0,
  onWhere = undefined as ((params: Record<string, any>) => void) | undefined,
} = {}) {
  const state: { params: Record<string, any> } = { params: {} };
  const qb: any = {
    leftJoinAndSelect: jest.fn(() => qb),
    leftJoin: jest.fn(() => qb),
    innerJoin: jest.fn(() => qb),
    select: jest.fn(() => qb),
    addSelect: jest.fn(() => qb),
    where: jest.fn((_sql: string, params?: Record<string, any>) => {
      if (params) Object.assign(state.params, params);
      onWhere?.(state.params);
      return qb;
    }),
    andWhere: jest.fn((_sql: string, params?: Record<string, any>) => {
      if (params) Object.assign(state.params, params);
      onWhere?.(state.params);
      return qb;
    }),
    groupBy: jest.fn(() => qb),
    addGroupBy: jest.fn(() => qb),
    orderBy: jest.fn(() => qb),
    limit: jest.fn(() => qb),
    take: jest.fn(() => qb),
    getMany: jest.fn(async () => many),
    getRawMany: jest.fn(async () => []),
    getCount: jest.fn(async () => count),
  };
  return { qb, state };
}

describe('CompanyDashboardService - operationalSummary', () => {
  const companyId = 'comp-1';
  const ownerId = 'owner-1';

  const now = new Date();
  const futureDate = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
  const yesterdayDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const storeA: any = {
    id: 'store-a',
    name: 'Sede Principal',
    timezone: 'America/Caracas',
    isDeleted: false,
    isCommissionExempt: false,
    accumulatedCommissionDebt: '45.50',
    deletionScheduledAt: futureDate,
  };

  const storeB: any = {
    id: 'store-b',
    name: 'Sede Norte',
    branchName: 'Av. Bolívar',
    timezone: 'America/Caracas',
    isDeleted: false,
    isCommissionExempt: false,
    accumulatedCommissionDebt: '12.25',
    deletionScheduledAt: null,
  };

  const storeExempt: any = {
    id: 'store-exempt',
    name: 'Sede Exenta',
    timezone: 'America/Caracas',
    isDeleted: false,
    isCommissionExempt: true,
    accumulatedCommissionDebt: '999.00',
    deletionScheduledAt: null,
  };

  const storeDeleted: any = {
    id: 'store-deleted',
    name: 'Sede Eliminada',
    timezone: 'America/Caracas',
    isDeleted: true,
    isCommissionExempt: false,
    accumulatedCommissionDebt: '500.00',
    deletionScheduledAt: futureDate,
  };

  const toGroupedRows = (
    activeStoreIds: string[],
    countsByStore: Record<string, number>,
  ) =>
    activeStoreIds
      .filter((id) => (countsByStore[id] || 0) > 0)
      .map((storeId) => ({
        storeId,
        cnt: String(countsByStore[storeId]),
      }));

  const defaultCurrentOrders = [
    {
      id: 'ord-1',
      status: OrderStatus.PENDING,
      finalAmount: '50.00',
      isPartialPayment: false,
      createdAt: now,
      store: storeA,
    },
    {
      id: 'ord-2',
      status: OrderStatus.PARTIALLY_PAID,
      finalAmount: '80.00',
      isPartialPayment: true,
      createdAt: now,
      store: storeA,
    },
    {
      id: 'ord-3',
      status: OrderStatus.PENDING,
      finalAmount: '40.00',
      isPartialPayment: false,
      createdAt: now,
      store: storeB,
    },
    {
      id: 'ord-4',
      status: OrderStatus.FULLY_PAID,
      finalAmount: '100.00',
      isPartialPayment: false,
      createdAt: now,
      store: storeB,
    },
  ];

  const defaultInstallmentOrders = [
    {
      id: 'inst-1',
      status: OrderStatus.PARTIALLY_PAID,
      isPartialPayment: true,
      remainingBalance: '35.50',
      store: storeA,
    },
    {
      id: 'inst-2',
      status: OrderStatus.PENDING,
      isPartialPayment: true,
      remainingBalance: '14.25',
      store: storeB,
    },
  ];

  const setup = ({
    stores = [storeA, storeB, storeExempt, storeDeleted],
    currentOrders = defaultCurrentOrders,
    installmentOrders = defaultInstallmentOrders,
    pendingReportsByStore = { 'store-a': 1, 'store-b': 1 } as Record<string, number>,
    activePromosByStore = { 'store-a': 2, 'store-b': 1 } as Record<string, number>,
    pendingPromosByStore = { 'store-b': 1 } as Record<string, number>,
    rankings = [
      {
        storeId: 'store-a',
        division: Division.TIENDA_MARCA,
        currentPR: 420,
        consecutiveSalesDays: 6,
        dailyMissionsCompletedToday: 2,
        lastMissionDate: now,
        inDangerZone: false,
        isFlagged: false,
      },
      {
        storeId: 'store-b',
        division: Division.LOCAL_ESTABLECIDO,
        currentPR: 310,
        consecutiveSalesDays: 9,
        dailyMissionsCompletedToday: 3,
        lastMissionDate: yesterdayDate,
        inDangerZone: true,
        isFlagged: false,
      },
      {
        storeId: 'store-deleted',
        division: Division.MAGNATE_MERCADO,
        currentPR: 9999,
        consecutiveSalesDays: 99,
        dailyMissionsCompletedToday: 5,
        lastMissionDate: now,
        inDangerZone: true,
        isFlagged: true,
      },
    ],
  } = {}) => {
    const companyRepo: any = {
      findOne: jest.fn(async () => ({
        id: companyId,
        owner: { id: ownerId },
        stores,
      })),
    };

    let orderQueryCall = 0;
    const orderRepo: any = {
      createQueryBuilder: jest.fn(() => {
        const callIndex = orderQueryCall++;
        const { qb, state } = createQueryBuilderMock();
        qb.getMany = jest.fn(async () => {
          const targetIds: string[] = state.params.targetStoreIds || [];
          const filterByStore = (list: any[]) =>
            list.filter((o) => targetIds.includes(o.store?.id));
          if (callIndex % 3 === 0) return filterByStore(currentOrders);
          if (callIndex % 3 === 2) return filterByStore(installmentOrders);
          return [];
        });
        return qb;
      }),
    };
    const paymentRepo: any = {
      createQueryBuilder: jest.fn(() => createQueryBuilderMock({ many: [] }).qb),
    };
    const orderItemRepo: any = {
      createQueryBuilder: jest.fn(() => {
        const qb = createQueryBuilderMock().qb;
        qb.getRawMany = jest.fn(async () => [
          {
            itemId: 'item-1',
            title: 'Camisa Premium',
            mainImage: '/img/1.png',
            itemStoreId: 'store-b',
            itemStoreName: 'Sede Norte',
            itemStoreBranchName: 'Av. Bolívar',
            orderStoreId: 'store-b',
            orderStoreName: 'Sede Norte',
            orderStoreBranchName: 'Av. Bolívar',
            unitsSold: '4',
            totalRevenue: '120.00',
          },
        ]);
        return qb;
      }),
    };
    const itemRepo: any = {
      createQueryBuilder: jest.fn(() =>
        createQueryBuilderMock({
          many: [
            {
              id: 'item-2',
              title: 'Gorra',
              mainImage: '/img/2.png',
              favoritesCount: 7,
              price: 25,
              discountPrice: null,
              stockQuantity: 3,
              trackInventory: true,
              hasVariants: false,
              variants: [],
              store: { id: 'store-a', name: 'Sede Principal', branchName: 'Centro' },
            },
          ],
        }).qb,
      ),
    };

    const commissionReportRepo: any = {
      createQueryBuilder: jest.fn(() => {
        const { qb, state } = createQueryBuilderMock();
        qb.getRawMany = jest.fn(async () =>
          toGroupedRows(state.params.activeStoreIds || [], pendingReportsByStore),
        );
        return qb;
      }),
    };

    let promoQueryCall = 0;
    const itemPromotionRepo: any = {
      createQueryBuilder: jest.fn(() => {
        const callIndex = promoQueryCall++;
        const { qb, state } = createQueryBuilderMock();
        qb.getRawMany = jest.fn(async () => {
          const ids: string[] = state.params.activeStoreIds || [];
          return toGroupedRows(
            ids,
            callIndex % 2 === 0 ? activePromosByStore : pendingPromosByStore,
          );
        });
        return qb;
      }),
    };

    const storeRankingRepo: any = {
      createQueryBuilder: jest.fn(() => {
        const { qb, state } = createQueryBuilderMock();
        qb.getMany = jest.fn(async () => {
          const ids: string[] = state.params.activeStoreIds || [];
          return rankings.filter((r) => ids.includes(r.storeId));
        });
        return qb;
      }),
    };

    const service = new CompanyDashboardService(
      companyRepo,
      {} as any,
      orderRepo,
      {} as any,
      itemRepo,
      paymentRepo,
      orderItemRepo,
      {} as any,
      commissionReportRepo,
      itemPromotionRepo,
      storeRankingRepo,
      {} as any,
    );

    return { service };
  };

  it('aggregates operationalSummary across active non-exempt stores for owner "all"', async () => {
    const { service } = setup();
    const res = await service.getAnalytics(
      companyId,
      { id: ownerId, role: 'COMPANY', isCollaborator: false },
      { period: DashboardPeriod.MONTH, storeId: 'all' },
    );

    expect(res.operationalSummary).toEqual({
      totalCommissionDebt: 57.75,
      storesWithDebtCount: 2,
      pendingCommissionReportsCount: 2,
      activePromotionsCount: 3,
      pendingPromotionsCount: 1,
      topDivision: Division.TIENDA_MARCA,
      topDivisionTitle: 'Tienda de Marca',
      highestPR: 420,
      maxConsecutiveSalesDays: 9,
      dailyMissionsCompletedToday: 2,
      storesInDangerZoneCount: 1,
      storesScheduledForDeletionCount: 1,
      topRankingStoreId: 'store-a',
      topRankingStoreName: 'Sede Principal',
      storeAlerts: [
        {
          storeId: 'store-a',
          storeName: 'Sede Principal',
          pendingOrders: 2,
          accountsReceivable: 35.5,
          commissionDebt: 45.5,
          pendingCommissionReportsCount: 1,
          activePromotionsCount: 2,
          pendingPromotionsCount: 0,
          isScheduledForDeletion: true,
        },
        {
          storeId: 'store-b',
          storeName: 'Sede Norte (Av. Bolívar)',
          pendingOrders: 1,
          accountsReceivable: 14.25,
          commissionDebt: 12.25,
          pendingCommissionReportsCount: 1,
          activePromotionsCount: 1,
          pendingPromotionsCount: 1,
          isScheduledForDeletion: false,
        },
        {
          storeId: 'store-exempt',
          storeName: 'Sede Exenta',
          pendingOrders: 0,
          accountsReceivable: 0,
          commissionDebt: 0,
          pendingCommissionReportsCount: 0,
          activePromotionsCount: 0,
          pendingPromotionsCount: 0,
          isScheduledForDeletion: false,
        },
      ],
    });

    expect(res.topProducts).toEqual([
      {
        itemId: 'item-1',
        title: 'Camisa Premium',
        mainImage: '/img/1.png',
        unitsSold: 4,
        totalRevenue: 120,
        storeId: 'store-b',
        storeName: 'Sede Norte (Av. Bolívar)',
      },
    ]);

    expect(res.topDesiredProducts).toEqual([
      {
        itemId: 'item-2',
        title: 'Gorra',
        mainImage: '/img/2.png',
        favoritesCount: 7,
        price: 25,
        stockQuantity: 3,
        trackInventory: true,
        hasVariants: false,
        storeId: 'store-a',
        storeName: 'Sede Principal (Centro)',
      },
    ]);
  });

  it('scopes operationalSummary strictly to single storeId when selected', async () => {
    const { service } = setup({
      pendingReportsByStore: { 'store-a': 3, 'store-b': 1 },
      activePromosByStore: { 'store-a': 5, 'store-b': 2 },
      pendingPromosByStore: { 'store-a': 2, 'store-b': 0 },
    });

    const res = await service.getAnalytics(
      companyId,
      { id: ownerId, role: 'COMPANY', isCollaborator: false },
      { period: DashboardPeriod.MONTH, storeId: 'store-b' },
    );

    expect(res.operationalSummary).toEqual({
      totalCommissionDebt: 12.25,
      storesWithDebtCount: 1,
      pendingCommissionReportsCount: 1,
      activePromotionsCount: 2,
      pendingPromotionsCount: 0,
      topDivision: Division.LOCAL_ESTABLECIDO,
      topDivisionTitle: 'Local Establecido',
      highestPR: 310,
      maxConsecutiveSalesDays: 9,
      dailyMissionsCompletedToday: 0,
      storesInDangerZoneCount: 1,
      storesScheduledForDeletionCount: 0,
      topRankingStoreId: 'store-b',
      topRankingStoreName: 'Sede Norte (Av. Bolívar)',
      storeAlerts: [
        {
          storeId: 'store-b',
          storeName: 'Sede Norte (Av. Bolívar)',
          pendingOrders: 1,
          accountsReceivable: 14.25,
          commissionDebt: 12.25,
          pendingCommissionReportsCount: 1,
          activePromotionsCount: 2,
          pendingPromotionsCount: 0,
          isScheduledForDeletion: false,
        },
      ],
    });
  });

  it('restricts operationalSummary to collaborator allowed branches and hides financial debt without metrics:view_financial', async () => {
    const { service } = setup({
      pendingReportsByStore: { 'store-a': 4, 'store-b': 2 },
      activePromosByStore: { 'store-a': 1, 'store-b': 99 },
      pendingPromosByStore: { 'store-a': 2, 'store-b': 5 },
    });

    const collaboratorWithoutFinance = {
      id: 'collab-1',
      isCollaborator: true,
      company: { id: companyId },
      hasFullBranchAccess: false,
      allowedBranchIds: ['store-a'],
      permissions: [CompanyPermission.ORDERS_VIEW],
    };

    const res = await service.getAnalytics(
      companyId,
      collaboratorWithoutFinance,
      { period: DashboardPeriod.MONTH, storeId: 'all' },
    );

    expect(res.operationalSummary).toEqual({
      totalCommissionDebt: 0,
      storesWithDebtCount: 0,
      pendingCommissionReportsCount: 0,
      activePromotionsCount: 1,
      pendingPromotionsCount: 2,
      topDivision: Division.TIENDA_MARCA,
      topDivisionTitle: 'Tienda de Marca',
      highestPR: 420,
      maxConsecutiveSalesDays: 6,
      dailyMissionsCompletedToday: 2,
      storesInDangerZoneCount: 0,
      storesScheduledForDeletionCount: 1,
      topRankingStoreId: 'store-a',
      topRankingStoreName: 'Sede Principal',
      storeAlerts: [
        {
          storeId: 'store-a',
          storeName: 'Sede Principal',
          pendingOrders: 2,
          accountsReceivable: 0,
          commissionDebt: 0,
          pendingCommissionReportsCount: 0,
          activePromotionsCount: 1,
          pendingPromotionsCount: 2,
          isScheduledForDeletion: true,
        },
      ],
    });
  });

  it('rejects unauthorized storeId for branch-restricted collaborators', async () => {
    const { service } = setup();
    const collaborator = {
      id: 'collab-2',
      isCollaborator: true,
      company: { id: companyId },
      hasFullBranchAccess: false,
      allowedBranchIds: ['store-a'],
      permissions: [CompanyPermission.METRICS_VIEW_FINANCIAL],
    };

    await expect(
      service.getAnalytics(companyId, collaborator, {
        period: DashboardPeriod.MONTH,
        storeId: 'store-b',
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('returns zeroed/null operationalSummary defaults when company has no stores or rankings', async () => {
    const { service } = setup({ stores: [], rankings: [] });
    const res = await service.getAnalytics(
      companyId,
      { id: ownerId, role: 'COMPANY', isCollaborator: false },
      { period: DashboardPeriod.MONTH, storeId: 'all' },
    );

    expect(res.operationalSummary).toEqual({
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
    });
  });
});
