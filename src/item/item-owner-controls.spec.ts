jest.mock('@nestjs/common/utils/load-package.util', () => ({
  loadPackage: (pkg: string) => require(pkg),
}));
jest.mock('@nestjs/typeorm', () => ({
  InjectRepository: () => () => {},
}));

import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ItemService } from './item.service';
import { CompanyPermission } from '../company/types/company-permission.enum';
import { OrderStatus } from '../order/types/order-status.enum';
import { UserRole } from '../user/types/user-role.enum';
import { ItemType } from './types/item-type.enum';

function createOrderItemQb(rawResult: Record<string, any>) {
  const calls: Array<{ sql: string; params?: Record<string, any> }> = [];
  const qb: any = {
    innerJoin: jest.fn(() => qb),
    select: jest.fn(() => qb),
    addSelect: jest.fn(() => qb),
    where: jest.fn((sql: string, params?: Record<string, any>) => {
      calls.push({ sql, params });
      return qb;
    }),
    andWhere: jest.fn((sql: string, params?: Record<string, any>) => {
      calls.push({ sql, params });
      return qb;
    }),
    getRawOne: jest.fn(async () => rawResult),
    _calls: calls,
  };
  return qb;
}

function createServiceHarness({
  itemData = {
    id: 'item-1',
    title: 'Café de especialidad',
    basePrice: 10,
    price: 10.5,
    commissionRate: 5,
    commissionAmount: 0.5,
    favoritesCount: 14,
    isDeleted: false,
    isActive: true,
    hasVariants: false,
    trackInventory: true,
    stockQuantity: 10,
    store: {
      id: 'store-1',
      name: 'Sucursal Principal',
      owner: { id: 'owner-1' },
      company: { id: 'company-1', owner: { id: 'owner-1' } },
    },
    variants: [],
  } as any,
  variants = [] as any[],
  rawStats = {
    unitsSold: '12',
    ordersCount: '7',
    grossRevenue: '126.00',
    netRevenue: '120.00',
  },
} = {}) {
  const savedItems: any[] = [];
  const savedVariants: any[] = [];
  const qb = createOrderItemQb(rawStats);

  const itemRepo: any = {
    findOne: jest.fn(async () => itemData),
    merge: jest.fn((entity: any, patch: any) => Object.assign(entity, patch)),
    save: jest.fn(async (entity: any) => {
      savedItems.push({ ...entity });
      return entity;
    }),
  };

  const itemVariantRepo: any = {
    find: jest.fn(async () => variants),
    save: jest.fn(async (v: any) => {
      savedVariants.push({ ...v });
      return v;
    }),
  };

  const orderItemRepo: any = {
    createQueryBuilder: jest.fn(() => qb),
    count: jest.fn(async () => 0),
  };

  const emptyRepo: any = {
    find: jest.fn(async () => []),
    findOne: jest.fn(async () => null),
    count: jest.fn(async () => 0),
    delete: jest.fn(async () => ({})),
  };

  const commissionService: any = {
    calculateCommission: jest.fn(async (basePrice: number) => {
      const rate = 5;
      const commissionAmount = Math.round(((basePrice * rate) / 100) * 100) / 100;
      return { rate, commissionAmount };
    }),
  };

  const activityLogService: any = { log: jest.fn() };

  const service = new ItemService(
    itemRepo,
    emptyRepo, // storeRepository
    emptyRepo, // storeCategoryRepository
    emptyRepo, // storePaymentMethodRepository
    emptyRepo, // templateRepository
    emptyRepo, // customizationGroupRepository
    emptyRepo, // customizationOptionRepository
    emptyRepo, // attributeValueRepository
    emptyRepo, // variantAxisRepository
    itemVariantRepo,
    orderItemRepo,
    emptyRepo, // orderDisputeRepository
    emptyRepo, // itemPromotionRepository
    {} as any, // platformSettingsService
    {} as any, // bookingService
    activityLogService,
    commissionService,
  );

  // Stub mapItemResponse-friendly findOne tail after update()
  jest
    .spyOn(service, 'findOne')
    .mockImplementation(async (id: string) => ({ id, updated: true }) as any);

  return {
    service,
    itemRepo,
    itemVariantRepo,
    orderItemRepo,
    qb,
    savedItems,
    savedVariants,
    commissionService,
  };
}

describe('ItemService owner-stats & granular collaborator RBAC', () => {
  describe('getOwnerStats', () => {
    it('returns full sales & financial stats for store owner with paid non-voided filters', async () => {
      const { service, qb } = createServiceHarness();

      const result = await service.getOwnerStats('item-1', {
        id: 'owner-1',
        role: UserRole.COMPANY,
      } as any);

      expect(result).toEqual({
        unitsSold: 12,
        ordersCount: 7,
        favoritesCount: 14,
        grossRevenue: 126,
        netRevenue: 120,
        canViewFinancials: true,
      });

      const allParams = Object.assign({}, ...qb._calls.map((c: any) => c.params || {}));
      expect(allParams.itemId).toBe('item-1');
      expect(allParams.statuses).toEqual([
        OrderStatus.FULLY_PAID,
        OrderStatus.PARTIALLY_PAID,
      ]);
      expect(allParams.isVoided).toBe(false);
    });

    it('throws ForbiddenException when collaborator belongs to a different branch', async () => {
      const { service } = createServiceHarness();

      await expect(
        service.getOwnerStats('item-1', {
          id: 'collab-1',
          isCollaborator: true,
          company: { id: 'company-1' },
          hasFullBranchAccess: false,
          allowedBranchIds: ['other-store'],
          permissions: [
            CompanyPermission.INVENTORY_VIEW,
            CompanyPermission.METRICS_VIEW_FINANCIAL,
          ],
        } as any),
      ).rejects.toThrow(ForbiddenException);
    });

    it('redacts grossRevenue and netRevenue when collaborator lacks financial permissions', async () => {
      const { service } = createServiceHarness();

      const result = await service.getOwnerStats('item-1', {
        id: 'collab-2',
        isCollaborator: true,
        company: { id: 'company-1' },
        hasFullBranchAccess: false,
        allowedBranchIds: ['store-1'],
        permissions: [CompanyPermission.INVENTORY_VIEW],
      } as any);

      expect(result).toEqual({
        unitsSold: 12,
        ordersCount: 7,
        favoritesCount: 14,
        grossRevenue: null,
        netRevenue: null,
        canViewFinancials: false,
      });
    });

    it('returns financial stats when collaborator holds metrics:view_financial', async () => {
      const { service } = createServiceHarness();

      const result = await service.getOwnerStats('item-1', {
        id: 'collab-3',
        isCollaborator: true,
        company: { id: 'company-1' },
        hasFullBranchAccess: true,
        permissions: [CompanyPermission.METRICS_VIEW_FINANCIAL],
      } as any);

      expect(result.canViewFinancials).toBe(true);
      expect(result.grossRevenue).toBe(126);
      expect(result.netRevenue).toBe(120);
    });

    it('throws NotFoundException when item does not exist', async () => {
      const { service } = createServiceHarness({ itemData: null });
      await expect(
        service.getOwnerStats('missing', { id: 'owner-1' } as any),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('update collaborator RBAC (inventory:change_price)', () => {
    it('allows collaborator with ONLY inventory:change_price to update price and discountPrice', async () => {
      const { service, savedItems } = createServiceHarness();

      await service.update(
        'item-1',
        { price: 20, discountPrice: 15 } as any,
        {
          id: 'collab-price',
          isCollaborator: true,
          company: { id: 'company-1' },
          hasFullBranchAccess: true,
          permissions: [CompanyPermission.INVENTORY_CHANGE_PRICE],
        } as any,
      );

      expect(savedItems).toHaveLength(1);
      expect(savedItems[0].basePrice).toBe(20);
      expect(savedItems[0].price).toBe(21); // 20 + 5%
      expect(savedItems[0].discountPrice).toBe(15.75); // 15 + 5%
    });

    it('clears existing discountPrice in database (sets null) when discountPrice: 0 is sent', async () => {
      const { service, savedItems } = createServiceHarness({
        itemData: {
          id: 'item-1',
          title: 'Café de especialidad',
          basePrice: 20,
          price: 21,
          discountPrice: 15.75,
          isDeleted: false,
          isActive: true,
          hasVariants: false,
          trackInventory: true,
          stockQuantity: 10,
          store: {
            id: 'store-1',
            name: 'Sucursal Principal',
            owner: { id: 'owner-1' },
            company: { id: 'company-1', owner: { id: 'owner-1' } },
          },
          variants: [],
        },
      });

      await service.update(
        'item-1',
        { price: 20, discountPrice: 0 } as any,
        {
          id: 'collab-price',
          isCollaborator: true,
          company: { id: 'company-1' },
          hasFullBranchAccess: true,
          permissions: [CompanyPermission.INVENTORY_CHANGE_PRICE],
        } as any,
      );

      expect(savedItems).toHaveLength(1);
      expect(savedItems[0].discountPrice).toBeNull();
    });

    it('allows collaborator with ONLY inventory:change_price to update variants[].price without variantAxes', async () => {
      const variantRow = {
        id: 'var-1',
        axisValues: { Tamaño: 'Grande' },
        basePrice: 10,
        price: 10.5,
        stockQuantity: 4,
        isActive: true,
      };
      const { service, savedVariants } = createServiceHarness({
        itemData: {
          id: 'item-1',
          title: 'Café',
          hasVariants: true,
          basePrice: 10,
          price: 10.5,
          isDeleted: false,
          isActive: true,
          trackInventory: true,
          store: {
            id: 'store-1',
            name: 'Sucursal Principal',
            owner: { id: 'owner-1' },
            company: { id: 'company-1' },
          },
          variants: [variantRow],
        },
        variants: [variantRow],
      });

      await service.update(
        'item-1',
        {
          variants: [
            {
              id: 'var-1',
              axisValues: { Tamaño: 'Grande' },
              price: 30,
            },
          ],
        } as any,
        {
          id: 'collab-price',
          isCollaborator: true,
          company: { id: 'company-1' },
          hasFullBranchAccess: true,
          permissions: [CompanyPermission.INVENTORY_CHANGE_PRICE],
        } as any,
      );

      expect(savedVariants).toHaveLength(1);
      expect(savedVariants[0].basePrice).toBe(30);
      expect(savedVariants[0].price).toBe(31.5);
    });

    it('rejects structural or stock changes for price-only collaborator with ForbiddenException', async () => {
      const { service } = createServiceHarness();

      await expect(
        service.update(
          'item-1',
          { title: 'Hack Title' } as any,
          {
            id: 'collab-price',
            isCollaborator: true,
            company: { id: 'company-1' },
            hasFullBranchAccess: true,
            permissions: [CompanyPermission.INVENTORY_CHANGE_PRICE],
          } as any,
        ),
      ).rejects.toThrow(ForbiddenException);

      await expect(
        service.update(
          'item-1',
          { stockQuantity: 99 } as any,
          {
            id: 'collab-price',
            isCollaborator: true,
            company: { id: 'company-1' },
            hasFullBranchAccess: true,
            permissions: [CompanyPermission.INVENTORY_CHANGE_PRICE],
          } as any,
        ),
      ).rejects.toThrow(ForbiddenException);

      await expect(
        service.update(
          'item-1',
          {
            variants: [
              { id: 'var-1', axisValues: { Color: 'Rojo' }, isActive: false },
            ],
          } as any,
          {
            id: 'collab-price',
            isCollaborator: true,
            company: { id: 'company-1' },
            hasFullBranchAccess: true,
            permissions: [CompanyPermission.INVENTORY_CHANGE_PRICE],
          } as any,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows stock-only collaborator to update stock and variant active state, but rejects price edits', async () => {
      const { service } = createServiceHarness();

      await expect(
        service.update(
          'item-1',
          { stockQuantity: 25 } as any,
          {
            id: 'collab-stock',
            isCollaborator: true,
            company: { id: 'company-1' },
            hasFullBranchAccess: true,
            permissions: [CompanyPermission.INVENTORY_MANAGE_STOCK],
          } as any,
        ),
      ).resolves.toEqual({ id: 'item-1', updated: true });

      await expect(
        service.update(
          'item-1',
          { price: 50 } as any,
          {
            id: 'collab-stock',
            isCollaborator: true,
            company: { id: 'company-1' },
            hasFullBranchAccess: true,
            permissions: [CompanyPermission.INVENTORY_MANAGE_STOCK],
          } as any,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getStoreOwnerSummary', () => {
    const sampleStore = {
      id: 'store-1',
      name: 'Sucursal Principal',
      owner: { id: 'owner-1' },
      company: { id: 'company-1', owner: { id: 'owner-1' } },
    };

    const sampleItems = [
      {
        id: 'i-1',
        isActive: true,
        isDeleted: false,
        itemType: ItemType.PRODUCT,
        trackInventory: true,
        hasVariants: false,
        stockQuantity: 10,
        price: 20,
        discountPrice: 15,
        variants: [],
      },
      {
        id: 'i-2',
        isActive: true,
        isDeleted: false,
        itemType: ItemType.PRODUCT,
        trackInventory: true,
        hasVariants: false,
        stockQuantity: 0,
        price: 12,
        discountPrice: null,
        variants: [],
      },
      {
        id: 'i-3',
        isActive: false,
        isDeleted: false,
        itemType: ItemType.PRODUCT,
        trackInventory: true,
        hasVariants: true,
        stockQuantity: 0,
        price: 30,
        discountPrice: null,
        variants: [
          { id: 'v-1', isActive: true, stockQuantity: 0 },
          { id: 'v-2', isActive: false, stockQuantity: 5 },
        ],
      },
      {
        id: 'i-4',
        isActive: true,
        isDeleted: false,
        itemType: ItemType.SERVICE,
        trackInventory: false,
        hasVariants: false,
        stockQuantity: 0,
        price: 45,
        discountPrice: null,
        variants: [],
      },
    ];

    it('computes accurate store catalog summary counts for store owner and branch collaborator', async () => {
      const { service, itemRepo } = createServiceHarness();
      const storeRepo = (service as any).storeRepository;
      storeRepo.findOne = jest.fn(async () => sampleStore);
      itemRepo.find = jest.fn(async () => sampleItems);

      const ownerSummary = await service.getStoreOwnerSummary('store-1', {
        id: 'owner-1',
        role: UserRole.COMPANY,
      } as any);

      expect(ownerSummary).toEqual({
        total: 4,
        published: 3,
        paused: 1,
        outOfStock: 2,
        discounted: 1,
        products: 3,
        services: 1,
      });

      const collabSummary = await service.getStoreOwnerSummary('store-1', {
        id: 'collab-1',
        isCollaborator: true,
        company: { id: 'company-1' },
        hasFullBranchAccess: false,
        allowedBranchIds: ['store-1'],
      } as any);

      expect(collabSummary).toEqual(ownerSummary);
    });

    it('rejects unauthorized user or collaborator from another branch with ForbiddenException', async () => {
      const { service } = createServiceHarness();
      const storeRepo = (service as any).storeRepository;
      storeRepo.findOne = jest.fn(async () => sampleStore);

      await expect(
        service.getStoreOwnerSummary('store-1', {
          id: 'stranger-1',
          role: UserRole.COMPANY,
        } as any),
      ).rejects.toThrow(ForbiddenException);

      await expect(
        service.getStoreOwnerSummary('store-1', {
          id: 'collab-other',
          isCollaborator: true,
          company: { id: 'company-1' },
          hasFullBranchAccess: false,
          allowedBranchIds: ['store-2'],
        } as any),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('findAll onlyOutOfStock filter & sort allowlist', () => {
    function createFindAllHarness() {
      const { service, itemRepo } = createServiceHarness();
      const andWhereCalls: Array<{ sql: string; params?: any }> = [];
      const orderByCalls: Array<{ sort: string; order: string }> = [];
      const qb: any = {
        leftJoinAndSelect: jest.fn(() => qb),
        leftJoin: jest.fn(() => qb),
        limit: jest.fn(() => qb),
        offset: jest.fn(() => qb),
        andWhere: jest.fn((sql: string, params?: any) => {
          andWhereCalls.push({ sql, params });
          return qb;
        }),
        addSelect: jest.fn(() => qb),
        orderBy: jest.fn((sort: string, order: string) => {
          orderByCalls.push({ sort, order });
          return qb;
        }),
        getManyAndCount: jest.fn(async () => [[], 0]),
      };
      itemRepo.createQueryBuilder = jest.fn(() => qb);
      return { service, andWhereCalls, orderByCalls };
    }

    it('applies onlyOutOfStock SQL predicate and allowlists sort columns safely', async () => {
      const { service, andWhereCalls, orderByCalls } = createFindAllHarness();

      await service.findAll(
        {
          includeInactive: true,
          onlyOutOfStock: true,
          sort: 'favoritesCount',
          order: 'DESC',
        } as any,
        null,
      );

      expect(
        andWhereCalls.some((c) => c.sql.includes('NOT EXISTS (SELECT 1 FROM item_variants')),
      ).toBe(true);
      expect(orderByCalls).toEqual([{ sort: 'item.favoritesCount', order: 'DESC' }]);
    });

    it('falls back to item.createdAt when sort is not in allowlist', async () => {
      const { service, orderByCalls } = createFindAllHarness();

      await service.findAll(
        {
          includeInactive: true,
          sort: 'maliciousColumn; DROP TABLE items;--',
          order: 'asc' as any,
        } as any,
        null,
      );

      expect(orderByCalls).toEqual([{ sort: 'item.createdAt', order: 'ASC' }]);
    });
  });
});
