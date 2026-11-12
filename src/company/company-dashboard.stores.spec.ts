jest.mock('@nestjs/common/utils/load-package.util', () => ({
  loadPackage: (pkg: string) => require(pkg),
}));
jest.mock('@nestjs/typeorm', () => ({
  InjectRepository: () => () => {},
}));

import { CompanyDashboardService } from './company-dashboard.service';
import { CompanyPermission } from './types/company-permission.enum';
import { StoreStatus } from 'src/store/types/status.enum';
import { Division } from 'src/ranking/types';

function createQbMock({
  rawMany = [] as any[],
  rawOne = { total: '0' } as any,
  many = [] as any[],
  count = 0,
  onWhere = undefined as ((params: Record<string, any>) => void) | undefined,
} = {}) {
  const state: { params: Record<string, any> } = { params: {} };
  const qb: any = {
    innerJoin: jest.fn(() => qb),
    leftJoin: jest.fn(() => qb),
    leftJoinAndSelect: jest.fn(() => qb),
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
    orderBy: jest.fn(() => qb),
    limit: jest.fn(() => qb),
    getRawMany: jest.fn(async () => rawMany),
    getRawOne: jest.fn(async () => rawOne),
    getMany: jest.fn(async () => many),
    getCount: jest.fn(async () => count),
  };
  return { qb, state };
}

describe('CompanyDashboardService - getCompanyStores & getDashboardStats', () => {
  const companyId = 'comp-1';
  const ownerId = 'owner-1';
  const now = new Date();
  const oldDate = new Date(now.getTime() - 45 * 24 * 60 * 60 * 1000);

  const storeA: any = {
    id: 'store-a',
    name: 'Tu Lojita',
    branchName: 'Centro',
    logo: '/a.png',
    status: StoreStatus.ACTIVE,
    timezone: 'America/Caracas',
    isDeleted: false,
    isCommissionExempt: false,
    accumulatedCommissionDebt: '32.75',
    createdAt: now,
    deletionScheduledAt: null,
    addresses: [{ address: 'Av. Central 10' }],
    aiSettings: { isEnabled: true, apiKeyHint: 'sk-...123' },
    items: [
      { id: 'it-1', isDeleted: false },
      { id: 'it-2', isDeleted: true },
    ],
  };

  const storeB: any = {
    id: 'store-b',
    name: 'Tu Lojita',
    branchName: 'Norte',
    logo: '/b.png',
    status: StoreStatus.ACTIVE,
    timezone: 'America/Caracas',
    isDeleted: false,
    isCommissionExempt: true,
    accumulatedCommissionDebt: '200.00',
    createdAt: oldDate,
    deletionScheduledAt: null,
    addresses: [],
    aiSettings: null,
    items: [{ id: 'it-3', isDeleted: false }],
  };

  const storeDeleted: any = {
    id: 'store-deleted',
    name: 'Tu Lojita Eliminada',
    logo: '/del.png',
    status: StoreStatus.INACTIVE,
    timezone: 'America/Caracas',
    isDeleted: true,
    isCommissionExempt: false,
    accumulatedCommissionDebt: '999.00',
    createdAt: now,
    items: [{ id: 'it-del', isDeleted: false }],
  };

  const setup = ({
    allStores = [storeA, storeB, storeDeleted],
    salesByStore = { 'store-a': 180.5, 'store-b': 45.0 } as Record<string, number>,
    statsSalesToday = '225.50',
    statsSalesYesterday = '250.00',
    pendingOrdersByStore = { 'store-a': 3, 'store-b': 1 } as Record<string, number>,
    pendingReportsByStore = { 'store-a': 2, 'store-b': 1 } as Record<string, number>,
    rankings = [
      {
        storeId: 'store-a',
        division: Division.TIENDA_MARCA,
        currentPR: 450,
        consecutiveSalesDays: 7,
        inDangerZone: false,
        isFlagged: false,
      },
      {
        storeId: 'store-b',
        division: Division.LOCAL_ESTABLECIDO,
        currentPR: 180,
        consecutiveSalesDays: 2,
        inDangerZone: true,
        isFlagged: false,
      },
    ],
    productsCount = 2,
    newProductsThisWeek = 1,
    customersTotal = '5',
    newCustomersMonth = '3',
  } = {}) => {
    const companyRepo: any = {
      findOne: jest.fn(async () => ({
        id: companyId,
        owner: { id: ownerId },
        stores: allStores,
      })),
    };

    const storeRepo: any = {
      find: jest.fn(async () => allStores.filter((s) => !s.isDeleted)),
    };

    const orderRepo: any = {
      createQueryBuilder: jest.fn(() => {
        const state: { params: Record<string, any>; sqls: string[] } = {
          params: {},
          sqls: [],
        };
        const qb: any = {
          innerJoin: jest.fn(() => qb),
          select: jest.fn(() => qb),
          addSelect: jest.fn(() => qb),
          where: jest.fn((sql: string, params?: Record<string, any>) => {
            state.sqls.push(sql);
            if (params) Object.assign(state.params, params);
            return qb;
          }),
          andWhere: jest.fn((sql: string, params?: Record<string, any>) => {
            state.sqls.push(sql);
            if (params) Object.assign(state.params, params);
            return qb;
          }),
          groupBy: jest.fn(() => qb),
          getRawMany: jest.fn(async () => {
            const ids: string[] = state.params.storeIds || [];
            return ids
              .filter((id) => (pendingOrdersByStore[id] || 0) > 0)
              .map((storeId) => ({
                storeId,
                cnt: String(pendingOrdersByStore[storeId]),
              }));
          }),
          getRawOne: jest.fn(async () => {
            const joinedSql = state.sqls.join(' ');
            if (joinedSql.includes('COUNT(DISTINCT order.userId)')) {
              return {
                total: joinedSql.includes('order.status IN')
                  ? newCustomersMonth
                  : customersTotal,
              };
            }
            if (state.params.storeId) {
              return { total: String(salesByStore[state.params.storeId] || 0) };
            }
            if (joinedSql.includes('startOfYesterday')) {
              return { total: statsSalesYesterday };
            }
            return { total: statsSalesToday };
          }),
        };
        return qb;
      }),
    };

    const itemQueriesObserved: Array<Record<string, any>> = [];
    let itemCall = 0;
    const itemRepo: any = {
      createQueryBuilder: jest.fn(() => {
        const call = itemCall++;
        const { qb, state } = createQbMock();
        qb.getCount = jest.fn(async () => {
          itemQueriesObserved.push({ ...state.params });
          return call % 2 === 0 ? productsCount : newProductsThisWeek;
        });
        return qb;
      }),
    };

    const commissionReportRepo: any = {
      createQueryBuilder: jest.fn(() => {
        const { qb, state } = createQbMock();
        qb.getRawMany = jest.fn(async () => {
          const ids: string[] = state.params.storeIds || [];
          return ids
            .filter((id) => (pendingReportsByStore[id] || 0) > 0)
            .map((storeId) => ({
              storeId,
              cnt: String(pendingReportsByStore[storeId]),
            }));
        });
        return qb;
      }),
    };

    const storeRankingRepo: any = {
      createQueryBuilder: jest.fn(() => {
        const { qb, state } = createQbMock();
        qb.getMany = jest.fn(async () => {
          const ids: string[] = state.params.storeIds || [];
          return rankings.filter((r) => ids.includes(r.storeId));
        });
        return qb;
      }),
    };

    const platformSettingsService: any = {
      isAiImageEnhancementEnabled: jest.fn(async () => true),
    };

    const service = new CompanyDashboardService(
      companyRepo,
      storeRepo,
      orderRepo,
      {} as any,
      itemRepo,
      {} as any,
      {} as any,
      {} as any,
      commissionReportRepo,
      {} as any,
      storeRankingRepo,
      platformSettingsService,
    );

    return {
      service,
      orderRepo,
      commissionReportRepo,
      itemQueriesObserved,
    };
  };

  it('enriches getCompanyStores for owner with batched operational metrics and excludes deleted items', async () => {
    const { service } = setup();
    const res = await service.getCompanyStores(companyId, {
      id: ownerId,
      role: 'COMPANY',
      isCollaborator: false,
    });

    expect(res.total).toBe(2);
    expect(res.stores).toHaveLength(2);
    expect(res.stores[0]).toMatchObject({
      id: 'store-a',
      productsCount: 1,
      salesToday: 180.5,
      pendingOrdersCount: 3,
      commissionDebt: 32.75,
      pendingCommissionReportsCount: 2,
      rankingDivisionTitle: 'Tienda de Marca',
      currentPR: 450,
      consecutiveSalesDays: 7,
      inDangerZone: false,
      aiEnabled: true,
    });
    expect(res.stores[1]).toMatchObject({
      id: 'store-b',
      productsCount: 1,
      salesToday: 45.0,
      pendingOrdersCount: 1,
      commissionDebt: 0, // exempt
      pendingCommissionReportsCount: 1,
      rankingDivisionTitle: 'Local Establecido',
      currentPR: 180,
      consecutiveSalesDays: 2,
      inDangerZone: true,
    });
  });

  it('enforces collaborator branch access and hides financial figures in getCompanyStores & getDashboardStats', async () => {
    const { service, commissionReportRepo, itemQueriesObserved } = setup({
      productsCount: 1,
      newProductsThisWeek: 1,
    });

    const restrictedCollab = {
      id: 'collab-1',
      isCollaborator: true,
      company: { id: companyId },
      hasFullBranchAccess: false,
      allowedBranchIds: ['store-a'],
      permissions: [CompanyPermission.ORDERS_VIEW],
    };

    const storesRes = await service.getCompanyStores(companyId, restrictedCollab);
    expect(storesRes.total).toBe(1);
    expect(storesRes.stores[0]).toMatchObject({
      id: 'store-a',
      salesToday: 0,
      commissionDebt: 0,
      pendingCommissionReportsCount: 0,
      pendingOrdersCount: 3,
      rankingDivisionTitle: 'Tienda de Marca',
      currentPR: 450,
    });
    expect(commissionReportRepo.createQueryBuilder).not.toHaveBeenCalled();

    const statsRes = await service.getDashboardStats(companyId, restrictedCollab);
    expect(statsRes.salesToday).toEqual({
      amount: 0,
      percentage: 0,
      currency: 'USD',
    });
    expect(statsRes.totalStores).toEqual({ count: 1, newThisMonth: 1 });
    expect(statsRes.totalProducts).toEqual({ count: 1, addedThisWeek: 1 });
    expect(itemQueriesObserved.every((p) => JSON.stringify(p.storeIds) === '["store-a"]')).toBe(
      true,
    );
  });

  it('computes accurate negative growth and excludes deleted stores in owner getDashboardStats', async () => {
    const { service, itemQueriesObserved } = setup({
      statsSalesToday: '200.00',
      statsSalesYesterday: '250.00',
    });

    const stats = await service.getDashboardStats(companyId, {
      id: ownerId,
      role: 'COMPANY',
      isCollaborator: false,
    });

    expect(stats.salesToday).toEqual({
      amount: 200,
      percentage: -20,
      currency: 'USD',
    });
    expect(stats.totalStores).toEqual({ count: 2, newThisMonth: 1 });
    expect(itemQueriesObserved[0].storeIds).toEqual(['store-a', 'store-b']);
  });

  it('returns empty stores and zeroed stats when no active authorized stores exist', async () => {
    const { service } = setup({ allStores: [storeDeleted] });
    const owner = { id: ownerId, role: 'COMPANY', isCollaborator: false };

    const storesRes = await service.getCompanyStores(companyId, owner);
    expect(storesRes).toEqual({ stores: [], total: 0 });

    const statsRes = await service.getDashboardStats(companyId, owner);
    expect(statsRes).toEqual({
      salesToday: { amount: 0, percentage: 0, currency: 'USD' },
      totalStores: { count: 0, newThisMonth: 0 },
      totalProducts: { count: 0, addedThisWeek: 0 },
      totalCustomers: { count: 0, newThisMonth: 0 },
    });
  });
});
