jest.mock('@nestjs/common/utils/load-package.util', () => ({
  loadPackage: jest.fn(),
}));

jest.mock('@nestjs/typeorm', () => ({
  InjectRepository: () => () => undefined,
}));

import { FavoriteService } from './favorite.service';

describe('FavoriteService.getUserFavorites variant stock resolution', () => {
  const buildQueryBuilderMock = (rows: any[]) => ({
    innerJoinAndSelect: jest.fn().mockReturnThis(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue(rows),
  });

  it('marks variant item inStock=true when an active variant has stockQuantity > 0 even if base stockQuantity is null', async () => {
    const rows = [
      {
        id: 'fav-1',
        priceWhenAdded: 30,
        createdAt: new Date(),
        item: {
          id: 'item-var-ok',
          price: 30,
          discountPrice: null,
          trackInventory: true,
          stockQuantity: null,
          hasVariants: true,
          variants: [
            { id: 'v1', isActive: true, stockQuantity: 0 },
            { id: 'v2', isActive: true, stockQuantity: 10 },
          ],
        },
      },
      {
        id: 'fav-2',
        priceWhenAdded: 30,
        createdAt: new Date(),
        item: {
          id: 'item-var-inactive-stock',
          price: 30,
          discountPrice: null,
          trackInventory: true,
          stockQuantity: 5,
          hasVariants: true,
          variants: [
            { id: 'v3', isActive: false, stockQuantity: 12 },
            { id: 'v4', isActive: true, stockQuantity: 0 },
          ],
        },
      },
      {
        id: 'fav-3',
        priceWhenAdded: 25,
        createdAt: new Date(),
        item: {
          id: 'item-var-empty',
          price: 25,
          discountPrice: null,
          trackInventory: true,
          stockQuantity: 10,
          hasVariants: true,
          variants: [],
        },
      },
      {
        id: 'fav-4',
        priceWhenAdded: 20,
        createdAt: new Date(),
        item: {
          id: 'item-simple',
          price: 20,
          discountPrice: null,
          trackInventory: true,
          stockQuantity: 4,
          hasVariants: false,
          variants: [],
        },
      },
    ];

    const favoriteRepoMock: any = {
      createQueryBuilder: jest.fn().mockReturnValue(buildQueryBuilderMock(rows)),
    };
    const service = new FavoriteService(favoriteRepoMock, {} as any);

    const result = await service.getUserFavorites('user-1');

    expect(result).toHaveLength(4);
    expect(result[0].inStock).toBe(true);
    expect(result[1].inStock).toBe(false);
    expect(result[2].inStock).toBe(false);
    expect(result[3].inStock).toBe(true);
  });

  it('computes isStoreSuspended, isStoreInactive, and canPurchase operational flags', async () => {
    const rows = [
      {
        id: 'fav-active',
        priceWhenAdded: 25,
        createdAt: new Date(),
        item: {
          id: 'item-active',
          price: 25,
          discountPrice: null,
          trackInventory: true,
          stockQuantity: 3,
          hasVariants: false,
          isActive: true,
          isDeleted: false,
          store: { id: 's-1', status: 'ACTIVE' },
        },
      },
      {
        id: 'fav-suspended',
        priceWhenAdded: 25,
        createdAt: new Date(),
        item: {
          id: 'item-suspended',
          price: 25,
          discountPrice: null,
          trackInventory: true,
          stockQuantity: 10,
          hasVariants: false,
          isActive: true,
          isDeleted: false,
          store: { id: 's-2', status: 'SUSPENDED' },
        },
      },
      {
        id: 'fav-inactive',
        priceWhenAdded: 25,
        createdAt: new Date(),
        item: {
          id: 'item-inactive',
          price: 25,
          discountPrice: null,
          trackInventory: true,
          stockQuantity: 10,
          hasVariants: false,
          isActive: true,
          isDeleted: false,
          store: { id: 's-3', status: 'INACTIVE' },
        },
      },
      {
        id: 'fav-closed',
        priceWhenAdded: 25,
        createdAt: new Date(),
        item: {
          id: 'item-closed',
          price: 25,
          discountPrice: null,
          trackInventory: true,
          stockQuantity: 10,
          hasVariants: false,
          isActive: true,
          isDeleted: false,
          store: { id: 's-4', status: 'CLOSED' },
        },
      },
      {
        id: 'fav-paused',
        priceWhenAdded: 25,
        createdAt: new Date(),
        item: {
          id: 'item-paused',
          price: 25,
          discountPrice: null,
          trackInventory: true,
          stockQuantity: 10,
          hasVariants: false,
          isActive: false,
          isDeleted: false,
          store: { id: 's-5', status: 'ACTIVE' },
        },
      },
    ];

    const qbMock = buildQueryBuilderMock(rows);
    const favoriteRepoMock: any = {
      createQueryBuilder: jest.fn().mockReturnValue(qbMock),
    };
    const service = new FavoriteService(favoriteRepoMock, {} as any);

    const result = await service.getUserFavorites('user-ops');

    expect(qbMock.andWhere).toHaveBeenCalledWith('item.isDeleted = false');
    expect(result).toHaveLength(5);

    expect(result[0]).toMatchObject({
      isStoreSuspended: false,
      isStoreInactive: false,
      canPurchase: true,
    });
    expect(result[1]).toMatchObject({
      isStoreSuspended: true,
      isStoreInactive: false,
      canPurchase: false,
    });
    expect(result[2]).toMatchObject({
      isStoreSuspended: false,
      isStoreInactive: true,
      canPurchase: false,
    });
    expect(result[3]).toMatchObject({
      isStoreSuspended: false,
      isStoreInactive: true,
      canPurchase: false,
    });
    expect(result[4]).toMatchObject({
      isStoreSuspended: false,
      isStoreInactive: false,
      canPurchase: false,
    });
  });
});
