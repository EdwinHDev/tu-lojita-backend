jest.mock('@nestjs/common/utils/load-package.util', () => ({
  loadPackage: (pkg: string) => require(pkg),
}));
jest.mock('@nestjs/typeorm', () => ({
  InjectRepository: () => () => {},
}));

import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { StoreService } from './store.service';
import { UserRole } from 'src/user/types/user-role.enum';
import { OrderStatus } from 'src/order/types';
import { CompanyPermission } from 'src/company/types/company-permission.enum';
import { MediationStatus } from './entities/mediation-request.entity';

function createQbMock({
  rawOne = { total: '0' } as any,
  many = [] as any[],
  count = 0,
} = {}) {
  const qb: any = {
    select: jest.fn(() => qb),
    addSelect: jest.fn(() => qb),
    innerJoin: jest.fn(() => qb),
    leftJoin: jest.fn(() => qb),
    leftJoinAndSelect: jest.fn(() => qb),
    where: jest.fn(() => qb),
    andWhere: jest.fn(() => qb),
    groupBy: jest.fn(() => qb),
    orderBy: jest.fn(() => qb),
    take: jest.fn(() => qb),
    limit: jest.fn(() => qb),
    getRawOne: jest.fn(async () => rawOne),
    getMany: jest.fn(async () => many),
    getCount: jest.fn(async () => count),
  };
  return qb;
}

describe('StoreService - getStoreDashboardData & findOne', () => {
  const storeId = 'store-1';
  const companyId = 'company-1';
  const ownerId = 'owner-1';

  const makeStore = (overrides: Record<string, any> = {}) => ({
    id: storeId,
    name: 'Tu Lojita Centro',
    timezone: 'America/Caracas',
    isDeleted: false,
    isCommissionExempt: false,
    accumulatedCommissionDebt: '45.67',
    owner: { id: ownerId },
    company: {
      id: companyId,
      owner: { id: ownerId },
    },
    aiSettings: {
      isEnabled: true,
      apiKeyHint: 'sk-...abcd',
    },
    ...overrides,
  });

  const makePaidOrder = (id: string, amount: number, createdAt: Date) => ({
    id,
    finalAmount: amount,
    status: OrderStatus.FULLY_PAID,
    createdAt,
    store: { id: storeId, name: 'Tu Lojita Centro' },
    user: { id: 'cust-1', firstName: 'Ana', lastName: 'Pérez' },
    orderItems: [
      {
        title: 'Zapatos Nike',
        variant: { imageUrl: 'https://cdn.example.com/nike.jpg' },
        item: { title: 'Zapatos Nike', mainImage: 'https://cdn.example.com/nike.jpg' },
      },
    ],
  });

  const makePendingOrder = (id: string, amount: number, createdAt: Date) => ({
    id,
    finalAmount: amount,
    status: OrderStatus.PENDING,
    createdAt,
    store: { id: storeId, name: 'Tu Lojita Centro' },
    user: { id: 'cust-2', firstName: 'Carlos', lastName: 'Gómez' },
    orderItems: [
      {
        title: 'Camisa Polo',
        variant: null,
        item: { title: 'Camisa Polo', mainImage: 'https://cdn.example.com/polo.jpg' },
      },
      {
        title: 'Gorra',
        variant: null,
        item: { title: 'Gorra' },
      },
    ],
  });

  function setupService({
    store = makeStore(),
    salesToday = '150',
    salesYesterday = '100',
    totalCustomers = '12',
    recentOrders = [makePaidOrder('ord-r1', 150, new Date('2026-05-01T14:00:00Z'))],
    pendingOrders = [makePendingOrder('ord-p1', 80, new Date('2026-05-01T15:00:00Z'))],
    pendingOrdersCount = 3,
    totalItems = 24,
    totalCategories = 6,
    openDisputesCount = 2,
    pendingReportsCount = 1,
    activeStrikesCount = 1,
    pendingMediationCount = 2,
    paymentMethodsCount = 3,
    globalAiEnabled = true,
  }: Record<string, any> = {}) {
    const storeRepo = {
      findOne: jest.fn(async () => store),
      count: jest.fn(async () => 2),
    };

    const orderQbQueue = [
      // salesToday
      createQbMock({ rawOne: { total: salesToday } }),
      // salesYesterday
      createQbMock({ rawOne: { total: salesYesterday } }),
      // totalCustomers
      createQbMock({ rawOne: { total: totalCustomers } }),
      // recentSales
      createQbMock({ many: recentOrders }),
      // pendingOrders list
      createQbMock({ many: pendingOrders }),
    ];

    const orderRepo = {
      createQueryBuilder: jest.fn(() => {
        if (orderQbQueue.length > 0) {
          return orderQbQueue.shift();
        }
        return createQbMock();
      }),
      count: jest.fn(async () => pendingOrdersCount),
    };

    const itemRepo = {
      count: jest.fn(async () => totalItems),
    };
    const storeCategoryRepo = {
      count: jest.fn(async () => totalCategories),
    };
    const disputeRepo = {
      createQueryBuilder: jest.fn(() =>
        createQbMock({ count: openDisputesCount }),
      ),
    };
    const commissionReportRepo = {
      createQueryBuilder: jest.fn(() =>
        createQbMock({ count: pendingReportsCount }),
      ),
    };
    const storeStrikeRepo = {
      count: jest.fn(async () => activeStrikesCount),
    };
    const mediationRequestRepo = {
      count: jest.fn(async () => pendingMediationCount),
    };
    const storePaymentMethodRepo = {
      count: jest.fn(async () => paymentMethodsCount),
    };
    const platformSettings = {
      isAiImageEnhancementEnabled: jest.fn(async () => globalAiEnabled),
    };
    const rankingService = {
      getLeaderboard: jest.fn(async () => ({ items: [] })),
    };

    const service = new StoreService(
      storeRepo as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      orderRepo as any,
      itemRepo as any,
      storeCategoryRepo as any,
      {} as any,
      mediationRequestRepo as any,
      {} as any,
      {} as any,
      {} as any,
      disputeRepo as any,
      {} as any,
      {} as any,
      {} as any,
      platformSettings as any,
      rankingService as any,
      {} as any,
      storeStrikeRepo as any,
      storePaymentMethodRepo as any,
      commissionReportRepo as any,
    );

    return {
      service,
      storeRepo,
      orderRepo,
      itemRepo,
      storeCategoryRepo,
      disputeRepo,
      commissionReportRepo,
      storeStrikeRepo,
      mediationRequestRepo,
      storePaymentMethodRepo,
      platformSettings,
    };
  }

  it('throws NotFoundException when store does not exist or isDeleted=true', async () => {
    const missing = setupService({ store: null });
    await expect(
      missing.service.getStoreDashboardData(storeId, {
        id: ownerId,
        role: UserRole.USER,
      }),
    ).rejects.toThrow(NotFoundException);

    const softDeleted = setupService({ store: makeStore({ isDeleted: true }) });
    await expect(
      softDeleted.service.getStoreDashboardData(storeId, {
        id: ownerId,
        role: UserRole.USER,
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('throws ForbiddenException for unauthorized users or collaborators outside branch/company', async () => {
    const { service } = setupService();

    // Another unrelated user
    await expect(
      service.getStoreDashboardData(storeId, {
        id: 'other-user',
        role: UserRole.USER,
      }),
    ).rejects.toThrow(ForbiddenException);

    // Cross-company collaborator
    await expect(
      service.getStoreDashboardData(storeId, {
        id: 'collab-1',
        isCollaborator: true,
        company: { id: 'company-2' },
        hasFullBranchAccess: true,
        permissions: [CompanyPermission.METRICS_VIEW_FINANCIAL],
      }),
    ).rejects.toThrow(ForbiddenException);

    // Same company collaborator without branch assignment
    await expect(
      service.getStoreDashboardData(storeId, {
        id: 'collab-2',
        isCollaborator: true,
        company: { id: companyId },
        hasFullBranchAccess: false,
        allowedBranchIds: ['other-store'],
        permissions: [CompanyPermission.ORDERS_VIEW],
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('returns complete operational, readiness, compliance, and day-over-day metrics for store owner', async () => {
    const {
      service,
      itemRepo,
      mediationRequestRepo,
      storePaymentMethodRepo,
    } = setupService({
      salesToday: '150',
      salesYesterday: '100',
    });

    const result = await service.getStoreDashboardData(storeId, {
      id: ownerId,
      role: UserRole.USER,
    });

    expect(itemRepo.count).toHaveBeenCalledWith({
      where: { store: { id: storeId }, isDeleted: false },
    });
    expect(storePaymentMethodRepo.count).toHaveBeenCalledWith({
      where: { store: { id: storeId }, isActive: true },
    });
    expect(mediationRequestRepo.count).toHaveBeenCalledWith({
      where: { storeId, status: MediationStatus.PENDING },
    });

    expect(result.stats).toEqual({
      salesToday: {
        amount: 150,
        percentage: 50,
        currency: 'USD',
      },
      totalItems: 24,
      totalCategories: 6,
      totalCustomers: 12,
      pendingOrdersCount: 3,
      openDisputesCount: 2,
      commissionDebt: 45.67,
      pendingCommissionReportsCount: 1,
      activeStrikesCount: 1,
      pendingMediationRequestsCount: 2,
      paymentMethodsCount: 3,
      aiEnabled: true,
    });
    expect(result.recentSales).toHaveLength(1);
    expect(result.pendingOrders).toEqual([
      expect.objectContaining({
        id: 'ord-p1',
        orderId: 'ord-p1',
        customerName: 'Carlos Gómez',
        amount: 80,
        currency: 'USD',
        status: OrderStatus.PENDING,
        itemTitle: 'Camisa Polo (+1)',
        itemImageUrl: 'https://cdn.example.com/polo.jpg',
      }),
    ]);
  });

  it('computes negative day-over-day percentage cleanly and respects commission exemption and disabled global AI', async () => {
    const { service } = setupService({
      store: makeStore({ isCommissionExempt: true }),
      salesToday: '80',
      salesYesterday: '100',
      globalAiEnabled: false,
    });

    const result = await service.getStoreDashboardData(storeId, {
      id: 'admin-1',
      role: UserRole.ADMIN,
    });

    expect(result.stats.salesToday.percentage).toBe(-20);
    expect(result.stats.commissionDebt).toBe(0);
    expect(result.stats.aiEnabled).toBe(false);
  });

  it('strips restricted financial, sales history, orders, disputes, and customer PII fields for limited collaborators', async () => {
    // 1. Collaborator with only inventory/branch view (no financial, no sales history, no orders, no disputes)
    const limitedCtx = setupService();
    const limitedResult = await limitedCtx.service.getStoreDashboardData(
      storeId,
      {
        id: 'collab-limited',
        isCollaborator: true,
        company: { id: companyId },
        hasFullBranchAccess: false,
        allowedBranchIds: [storeId],
        permissions: [CompanyPermission.INVENTORY_VIEW],
      },
    );

    expect(limitedResult.stats.salesToday).toEqual({
      amount: 0,
      percentage: 0,
      currency: 'USD',
    });
    expect(limitedResult.stats.commissionDebt).toBe(0);
    expect(limitedResult.stats.pendingCommissionReportsCount).toBe(0);
    expect(limitedResult.stats.pendingOrdersCount).toBe(0);
    expect(limitedResult.stats.openDisputesCount).toBe(0);
    expect(limitedResult.stats.activeStrikesCount).toBe(0);
    expect(limitedResult.stats.pendingMediationRequestsCount).toBe(0);
    expect(limitedResult.recentSales).toEqual([]);
    expect(limitedResult.pendingOrders).toEqual([]);
    expect(limitedCtx.commissionReportRepo.createQueryBuilder).not.toHaveBeenCalled();
    expect(limitedCtx.disputeRepo.createQueryBuilder).not.toHaveBeenCalled();

    // 2. Collaborator with ORDERS_VIEW + METRICS_VIEW_SALES_HISTORY but without METRICS_VIEW_FINANCIAL or ORDERS_VIEW_CUSTOMER_DATA
    const opsStoreRepo = { findOne: jest.fn(async () => makeStore()) };
    const opsOrderQb = [
      // totalCustomers (only 1st QB when financial queries skipped)
      createQbMock({ rawOne: { total: '12' } }),
      // recentSales
      createQbMock({
        many: [makePaidOrder('ord-r1', 150, new Date('2026-05-01T14:00:00Z'))],
      }),
      // pendingOrders
      createQbMock({
        many: [makePendingOrder('ord-p1', 80, new Date('2026-05-01T15:00:00Z'))],
      }),
    ];
    const opsOrderRepo = {
      createQueryBuilder: jest.fn(() => opsOrderQb.shift()),
      count: jest.fn(async () => 4),
    };
    const opsService = new StoreService(
      opsStoreRepo as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      opsOrderRepo as any,
      { count: jest.fn(async () => 10) } as any,
      { count: jest.fn(async () => 2) } as any,
      {} as any,
      { count: jest.fn(async () => 1) } as any,
      {} as any,
      {} as any,
      {} as any,
      { createQueryBuilder: jest.fn(() => createQbMock({ count: 0 })) } as any,
      {} as any,
      {} as any,
      {} as any,
      { isAiImageEnhancementEnabled: jest.fn(async () => true) } as any,
      { getLeaderboard: jest.fn(async () => ({ items: [] })) } as any,
      {} as any,
      { count: jest.fn(async () => 1) } as any,
      { count: jest.fn(async () => 1) } as any,
      { createQueryBuilder: jest.fn(() => createQbMock({ count: 5 })) } as any,
    );

    const opsResult = await opsService.getStoreDashboardData(storeId, {
      id: 'collab-ops',
      isCollaborator: true,
      company: { id: companyId },
      hasFullBranchAccess: true,
      permissions: [
        CompanyPermission.ORDERS_VIEW,
        CompanyPermission.METRICS_VIEW_SALES_HISTORY,
      ],
    });

    expect(opsResult.stats.salesToday.amount).toBe(0);
    expect(opsResult.stats.salesToday.percentage).toBe(0);
    expect(opsResult.stats.commissionDebt).toBe(0);
    expect(opsResult.stats.pendingCommissionReportsCount).toBe(0);
    expect(opsResult.recentSales).toHaveLength(1);
    expect(opsResult.recentSales[0].amount).toBe(0);
    expect(opsResult.stats.pendingOrdersCount).toBe(4);
    expect(opsResult.stats.activeStrikesCount).toBe(1);
    expect(opsResult.stats.pendingMediationRequestsCount).toBe(0);
    expect(opsResult.pendingOrders[0].customerName).toBe('Cliente');
    expect(opsResult.pendingOrders[0].amount).toBe(0);
  });

  it('findOne counts only non-deleted items (isDeleted: false)', async () => {
    const { service, itemRepo } = setupService({ totalItems: 9 });
    const store = await service.findOne(storeId, {
      id: ownerId,
      role: UserRole.USER,
      birthDate: new Date('1990-01-01'),
    } as any);

    expect(itemRepo.count).toHaveBeenCalledWith({
      where: { store: { id: storeId }, isDeleted: false },
    });
    expect(store.productsCount).toBe(9);
  });
});
