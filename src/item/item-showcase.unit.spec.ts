import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ItemService } from './item.service';
import { ItemPromotionStatus } from './types/item-promotion-status.enum';

describe('ItemService - Featured Showcase (Vitrina de Destacados)', () => {
  const commonMocks = {
    customizationGroupRepo: { find: async () => [] } as any,
    attributeValueRepo: { find: async () => [] } as any,
    variantAxisRepo: { find: async () => [] } as any,
    itemVariantRepo: { find: async () => [] } as any,
    storeRepo: {
      createQueryBuilder: () => ({
        select: () => ({
          addSelect: () => ({
            where: () => ({
              groupBy: () => ({
                getRawMany: async () => [],
              }),
            }),
          }),
        }),
      }),
    } as any,
  };

  it('debe retornar enabled: false y lista vacia si la vitrina esta desactivada globalmente', async () => {
    const mockPlatformSettingsService: any = {
      getFeaturedShowcaseConfig: async () => ({
        enabled: false,
        title: 'Productos Destacados',
        carouselSeconds: 5,
        maxItems: 10,
        fillWithBestSellers: true,
        pricePerDay: 2.0,
      }),
    };

    const service = new ItemService(
      {} as any,
      commonMocks.storeRepo,
      {} as any,
      {} as any,
      {} as any,
      commonMocks.customizationGroupRepo,
      {} as any,
      commonMocks.attributeValueRepo,
      commonMocks.variantAxisRepo,
      commonMocks.itemVariantRepo,
      {} as any,
      {} as any,
      {} as any,
      mockPlatformSettingsService,
      {} as any,
      {} as any,
    );

    const result = await service.getFeaturedShowcase();

    assert.equal(result.enabled, false);
    assert.deepEqual(result.items, []);
  });

  it('debe priorizar destacados pagados y rellenar cupos con mas vendidos sin exceder maxItems', async () => {
    const config = {
      enabled: true,
      title: 'Vitrina Estelar',
      carouselSeconds: 5,
      maxItems: 3,
      fillWithBestSellers: true,
      pricePerDay: 2.0,
    };

    const mockPlatformSettingsService: any = {
      getFeaturedShowcaseConfig: async () => config,
    };

    const item1 = {
      id: 'item-1',
      title: 'Telefono Pro',
      price: 500,
      isActive: true,
      isDeleted: false,
      trackInventory: false,
      store: { id: 's-1', name: 'Tienda Tech', isActive: true },
    };

    const item2 = {
      id: 'item-2',
      title: 'Audifonos Ultra',
      price: 100,
      isActive: true,
      isDeleted: false,
      trackInventory: false,
      store: { id: 's-2', name: 'Audio Store', isActive: true },
    };

    const fallbackItem = {
      id: 'item-fallback-1',
      title: 'Cargador Rapido (Mas vendido)',
      price: 25,
      isActive: true,
      isDeleted: false,
      trackInventory: false,
      store: { id: 's-1', name: 'Tienda Tech', isActive: true },
    };

    const promoQb: any = {
      innerJoinAndSelect: () => promoQb,
      leftJoinAndSelect: () => promoQb,
      where: () => promoQb,
      andWhere: () => promoQb,
      orderBy: () => promoQb,
      take: () => promoQb,
      getMany: async () => [
        {
          id: 'promo-1',
          status: ItemPromotionStatus.APPROVED,
          startsAt: new Date(),
          expiresAt: new Date(Date.now() + 86400000),
          item: item1,
        },
        {
          id: 'promo-2',
          status: ItemPromotionStatus.APPROVED,
          startsAt: new Date(),
          expiresAt: new Date(Date.now() + 86400000),
          item: item2,
        },
      ],
    };

    const mockPromotionRepo: any = {
      createQueryBuilder: () => promoQb,
    };

    const bestSellersQb: any = {
      innerJoin: () => bestSellersQb,
      select: () => bestSellersQb,
      addSelect: () => bestSellersQb,
      where: () => bestSellersQb,
      andWhere: () => bestSellersQb,
      groupBy: () => bestSellersQb,
      orderBy: () => bestSellersQb,
      limit: () => bestSellersQb,
      getRawMany: async () => [
        { itemId: 'item-fallback-1', totalSold: '45' },
      ],
    };

    const mockOrderItemRepo: any = {
      createQueryBuilder: () => bestSellersQb,
    };

    const itemsQb: any = {
      leftJoinAndSelect: () => itemsQb,
      where: () => itemsQb,
      andWhere: () => itemsQb,
      getMany: async () => [fallbackItem],
    };

    const mockItemRepo: any = {
      createQueryBuilder: () => itemsQb,
    };

    const service = new ItemService(
      mockItemRepo,
      commonMocks.storeRepo,
      {} as any,
      {} as any,
      {} as any,
      commonMocks.customizationGroupRepo,
      {} as any,
      commonMocks.attributeValueRepo,
      commonMocks.variantAxisRepo,
      commonMocks.itemVariantRepo,
      mockOrderItemRepo,
      {} as any,
      mockPromotionRepo,
      mockPlatformSettingsService,
      {} as any,
      {} as any,
    );

    const result = await service.getFeaturedShowcase();

    assert.equal(result.enabled, true);
    assert.equal(result.items.length, 3);

    // Primero los 2 destacados
    assert.equal(result.items[0].id, 'item-1');
    assert.equal(result.items[0].isFeaturedAd, true);
    assert.equal(result.items[0].badgeLabel, 'DESTACADO');

    assert.equal(result.items[1].id, 'item-2');
    assert.equal(result.items[1].isFeaturedAd, true);
    assert.equal(result.items[1].badgeLabel, 'DESTACADO');

    // Luego el fallback ocupando el 3er y último cupo
    assert.equal(result.items[2].id, 'item-fallback-1');
    assert.equal(result.items[2].isFeaturedAd, false);
    assert.equal(result.items[2].isFallback, true);
    assert.equal(result.items[2].badgeLabel, 'TOP VENTAS');
  });

  it('desplaza automaticamente los items de fallback cuando se llena el cupo con destacados', async () => {
    const config = {
      enabled: true,
      title: 'Vitrina Estelar',
      carouselSeconds: 5,
      maxItems: 2, // Cupo para 2 items
      fillWithBestSellers: true,
      pricePerDay: 2.0,
    };

    const mockPlatformSettingsService: any = {
      getFeaturedShowcaseConfig: async () => config,
    };

    const item1 = { id: 'it-1', title: 'Prod 1', price: 10, isActive: true, isDeleted: false, store: { name: 'S1' } };
    const item2 = { id: 'it-2', title: 'Prod 2', price: 20, isActive: true, isDeleted: false, store: { name: 'S2' } };

    const promoQb: any = {
      innerJoinAndSelect: () => promoQb,
      leftJoinAndSelect: () => promoQb,
      where: () => promoQb,
      andWhere: () => promoQb,
      orderBy: () => promoQb,
      take: () => promoQb,
      getMany: async () => [
        { id: 'p-1', status: ItemPromotionStatus.APPROVED, item: item1 },
        { id: 'p-2', status: ItemPromotionStatus.APPROVED, item: item2 },
      ],
    };

    let orderItemCalled = false;
    const mockOrderItemRepo: any = {
      createQueryBuilder: () => {
        orderItemCalled = true;
        return {};
      },
    };

    const service = new ItemService(
      {} as any,
      commonMocks.storeRepo,
      {} as any,
      {} as any,
      {} as any,
      commonMocks.customizationGroupRepo,
      {} as any,
      commonMocks.attributeValueRepo,
      commonMocks.variantAxisRepo,
      commonMocks.itemVariantRepo,
      mockOrderItemRepo,
      {} as any,
      { createQueryBuilder: () => promoQb } as any,
      mockPlatformSettingsService,
      {} as any,
      {} as any,
    );

    const result = await service.getFeaturedShowcase();

    // Como hay 2 destacados y maxItems = 2, no se debe llamar la consulta de más vendidos
    assert.equal(orderItemCalled, false);
    assert.equal(result.items.length, 2);
    assert.equal(result.items.every((i) => i.isFeaturedAd === true), true);
  });
});
