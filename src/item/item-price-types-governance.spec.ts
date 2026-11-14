jest.mock('@nestjs/common/utils/load-package.util', () => ({
  loadPackage: (pkg: string) => require(pkg),
}));
jest.mock('@nestjs/typeorm', () => ({
  InjectRepository: () => () => {},
}));

import { BadRequestException } from '@nestjs/common';
import { PlatformSettingsService, PLATFORM_KEYS } from 'src/platform-settings/platform-settings.service';
import { ItemService } from './item.service';
import { OrderService } from 'src/order/order.service';
import { PaymentService } from 'src/payment/payment.service';
import { PriceType } from './types/price-type.enum';
import { ItemType } from './types/item-type.enum';
import { StoreStatus } from 'src/store/types/status.enum';
import { NotificationType } from 'src/notification/entities/notification.entity';

describe('Item Price Types Governance, Cascade & Security', () => {
  describe('PlatformSettingsService', () => {
    it('siempre garantiza FIXED habilitado y lo expone en getPublicSettings', async () => {
      const storeMap = new Map<string, string>();
      const repoMock: any = {
        findOneBy: jest.fn(async ({ key }: any) =>
          storeMap.has(key) ? { key, value: storeMap.get(key) } : null,
        ),
        save: jest.fn(async ({ key, value }: any) => {
          storeMap.set(key, value);
          return { key, value };
        }),
      };
      const service = new PlatformSettingsService(repoMock);

      const saved = await service.setEnabledPriceTypes([
        PriceType.NEGOTIABLE,
        PriceType.ON_DEMAND,
      ]);
      expect(saved).toContain(PriceType.FIXED);
      expect(saved).toEqual([
        PriceType.FIXED,
        PriceType.NEGOTIABLE,
        PriceType.ON_DEMAND,
      ]);

      const enabled = await service.getEnabledPriceTypes();
      expect(enabled).toEqual([
        PriceType.FIXED,
        PriceType.NEGOTIABLE,
        PriceType.ON_DEMAND,
      ]);

      const pub = await service.getPublicSettings();
      expect(pub.enabledPriceTypes).toEqual(enabled);
      expect(storeMap.get(PLATFORM_KEYS.ITEM_ENABLED_PRICE_TYPES)).toBe(
        'FIXED,NEGOTIABLE,ON_DEMAND',
      );
    });
  });

  function buildItemService(options?: {
    enabledPriceTypes?: PriceType[];
    affectedItems?: any[];
    existingItem?: any;
  }) {
    let currentEnabled = options?.enabledPriceTypes ?? Object.values(PriceType);
    const affectedItems = options?.affectedItems ?? [];

    const mockItemRepo: any = {
      find: jest.fn(async () => affectedItems),
      findOne: jest.fn(async () => options?.existingItem ?? null),
      update: jest.fn(async () => ({ affected: affectedItems.length })),
      merge: jest.fn((target: any, src: any) => Object.assign(target, src)),
      create: jest.fn((dto: any) => ({ ...dto })),
      save: jest.fn(async (it: any) => ({ id: it.id || 'item-new', ...it })),
      createQueryBuilder: jest.fn(() => {
        const qb: any = {
          select: jest.fn(() => qb),
          addSelect: jest.fn(() => qb),
          where: jest.fn(() => qb),
          andWhere: jest.fn(() => qb),
          groupBy: jest.fn(() => qb),
          getRawMany: jest.fn(async () => [
            {
              priceType: PriceType.NEGOTIABLE,
              activeItemsCount: '4',
              affectedStoresCount: '2',
            },
          ]),
        };
        return qb;
      }),
    };

    const mockStoreRepo: any = {
      findOne: jest.fn(async () => ({
        id: 'store-1',
        name: 'Tienda Uno',
        owner: { id: 'owner-1' },
        company: { id: 'comp-1', owner: { id: 'owner-1' } },
      })),
    };

    const mockCategoryRepo: any = {
      count: jest.fn(async () => 1),
      findOne: jest.fn(async () => ({ id: 'cat-1' })),
    };

    const mockPaymentRepo: any = {
      count: jest.fn(async () => 1),
    };

    const mockPlatformSettings: any = {
      getEnabledPriceTypes: jest.fn(async () => currentEnabled),
      setEnabledPriceTypes: jest.fn(async (types: PriceType[]) => {
        currentEnabled = Array.from(new Set([PriceType.FIXED, ...types]));
        return currentEnabled;
      }),
    };

    const mockActivityLog: any = {
      log: jest.fn(async () => {}),
    };

    const mockCommission: any = {
      calculateCommission: jest.fn(async (base: number) => ({
        rate: 5,
        commissionAmount: Math.round(base * 0.05 * 100) / 100,
      })),
    };

    const mockNotificationService: any = {
      create: jest.fn(async () => ({ id: 'notif-1' })),
    };

    const service = new ItemService(
      mockItemRepo,
      mockStoreRepo,
      mockCategoryRepo,
      mockPaymentRepo,
      { find: async () => [] } as any,
      { find: async () => [], delete: async () => {} } as any,
      { delete: async () => {} } as any,
      { find: async () => [] } as any,
      { find: async () => [] } as any,
      { find: async () => [] } as any,
      { count: async () => 0 } as any,
      {} as any,
      {} as any,
      mockPlatformSettings,
      {} as any,
      mockActivityLog,
      mockCommission,
      mockNotificationService,
    );

    (service as any).findOne = jest.fn(async (id: string) => ({ id }));
    (service as any).saveCustomizationAndAttributes = jest.fn(async () => {});
    (service as any).saveVariantsAndAxes = jest.fn(async () => {});

    return {
      service,
      mockItemRepo,
      mockActivityLog,
      mockNotificationService,
      mockPlatformSettings,
    };
  }

  describe('ItemService - Despublicación en cascada y notificación única por tienda', () => {
    it('despublica todos los artículos afectados y envía exactamente 1 notificación por tienda afectada', async () => {
      const storeA = {
        id: 'store-a',
        name: 'Tienda A',
        owner: { id: 'owner-a' },
        company: { id: 'comp-a', owner: { id: 'owner-a' } },
      };
      const storeB = {
        id: 'store-b',
        name: 'Tienda B',
        owner: { id: 'owner-b' },
        company: { id: 'comp-b', owner: { id: 'owner-b' } },
      };

      const affectedItems = [
        { id: 'i1', title: 'Camisa 1', priceType: PriceType.NEGOTIABLE, store: storeA },
        { id: 'i2', title: 'Camisa 2', priceType: PriceType.NEGOTIABLE, store: storeA },
        { id: 'i3', title: 'Camisa 3', priceType: PriceType.NEGOTIABLE, store: storeA },
        { id: 'i4', title: 'Camisa 4', priceType: PriceType.NEGOTIABLE, store: storeA },
        { id: 'i5', title: 'Zapato B', priceType: PriceType.NEGOTIABLE, store: storeB },
      ];

      const { service, mockItemRepo, mockActivityLog, mockNotificationService } =
        buildItemService({
          enabledPriceTypes: Object.values(PriceType),
          affectedItems,
        });

      const res = await service.updateEnabledPriceTypesAndCascade(
        [PriceType.FIXED, PriceType.STARTING_AT, PriceType.ON_DEMAND, PriceType.FREE],
        { id: 'admin-1' } as any,
      );

      expect(mockItemRepo.update).toHaveBeenCalledTimes(1);
      expect(res.cascadeResult.unpublishedItemsCount).toBe(5);
      expect(res.cascadeResult.notifiedStoresCount).toBe(2);

      // Exactamente 1 notificación para Store A y 1 notificación para Store B
      expect(mockNotificationService.create).toHaveBeenCalledTimes(2);
      expect(mockNotificationService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'owner-a',
          storeId: 'store-a',
          type: NotificationType.ITEM_HIDDEN,
          body: expect.stringContaining('4 artículos de tu tienda "Tienda A"'),
        }),
      );
      expect(mockNotificationService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'owner-b',
          storeId: 'store-b',
          type: NotificationType.ITEM_HIDDEN,
          body: expect.stringContaining('tu artículo "Zapato B" de la tienda "Tienda B"'),
        }),
      );
      expect(mockActivityLog.log).toHaveBeenCalledTimes(2);
    });

    it('no envía notificaciones si no existen artículos activos usando el tipo deshabilitado', async () => {
      const { service, mockItemRepo, mockNotificationService } = buildItemService({
        enabledPriceTypes: Object.values(PriceType),
        affectedItems: [],
      });

      const res = await service.updateEnabledPriceTypesAndCascade(
        [PriceType.FIXED],
        { id: 'admin-1' } as any,
      );

      expect(mockItemRepo.update).not.toHaveBeenCalled();
      expect(mockNotificationService.create).not.toHaveBeenCalled();
      expect(res.cascadeResult.unpublishedItemsCount).toBe(0);
    });
  });

  describe('ItemService - Candados de creación, republicación y coherencia semántica', () => {
    const ownerUser: any = { id: 'owner-1' };

    it('rechaza crear un artículo con un tipo de precio deshabilitado', async () => {
      const { service } = buildItemService({
        enabledPriceTypes: [PriceType.FIXED, PriceType.ON_DEMAND],
      });

      await expect(
        service.create(
          {
            title: 'Producto Demo',
            description: 'Descripción válida del producto demo',
            storeId: 'store-1',
            mainImage: 'img.jpg',
            images: ['img.jpg'],
            itemType: ItemType.PRODUCT,
            priceType: PriceType.NEGOTIABLE,
            basePrice: 15,
            trackInventory: false,
          } as any,
          ownerUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('bloquea republicar (isActive=true) un artículo cuyo priceType fue deshabilitado hasta que lo cambie', async () => {
      const existingItem = {
        id: 'item-1',
        title: 'Producto Negociable',
        priceType: PriceType.NEGOTIABLE,
        itemType: ItemType.PRODUCT,
        isActive: false,
        isDeleted: false,
        hasVariants: false,
        requiresBooking: false,
        basePrice: 20,
        price: 21,
        trackInventory: false,
        variants: [],
        customizationGroupsRel: [],
        store: { id: 'store-1', name: 'Tienda Uno', owner: ownerUser },
      };

      const { service } = buildItemService({
        enabledPriceTypes: [PriceType.FIXED],
        existingItem,
      });

      await expect(
        service.update('item-1', { isActive: true } as any, ownerUser),
      ).rejects.toThrow(/deshabilitado en la plataforma/i);

      await expect(
        service.update(
          'item-1',
          { priceType: PriceType.FIXED, basePrice: 20, isActive: true } as any,
          ownerUser,
        ),
      ).resolves.toEqual({ id: 'item-1' });
    });

    it('rechaza STARTING_AT en un producto físico simple sin variantes distintas, extras pagados ni reservas', async () => {
      const { service } = buildItemService({
        enabledPriceTypes: Object.values(PriceType),
      });

      await expect(
        service.create(
          {
            title: 'Producto Simple',
            description: 'Descripción suficientemente larga para test',
            storeId: 'store-1',
            mainImage: 'img.jpg',
            images: ['img.jpg'],
            itemType: ItemType.PRODUCT,
            priceType: PriceType.STARTING_AT,
            basePrice: 10,
            trackInventory: false,
            requiresBooking: false,
            hasVariants: false,
          } as any,
          ownerUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rechaza FREE si incluye personalizaciones o variantes con costo adicional', async () => {
      const { service } = buildItemService({
        enabledPriceTypes: Object.values(PriceType),
      });

      await expect(
        service.create(
          {
            title: 'Muestra Gratis',
            description: 'Descripción suficientemente larga para test',
            storeId: 'store-1',
            mainImage: 'img.jpg',
            images: ['img.jpg'],
            itemType: ItemType.PRODUCT,
            priceType: PriceType.FREE,
            trackInventory: false,
            customizationGroups: [
              { name: 'Extras', options: [{ name: 'Empaque', price: 2 }] },
            ],
          } as any,
          ownerUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('OrderService - Seguridad de checkout para ON_DEMAND y FREE', () => {
    function buildOrderService(itemOverride: any) {
      const store = {
        id: 'store-1',
        name: 'Tienda Test',
        status: StoreStatus.ACTIVE,
        allowPartialPayments: true,
        partialPaymentsFeePercentage: 0,
        minInitialPaymentPercentage: 20,
        maxInstallments: 3,
      };

      const queryRunnerMock: any = {
        connect: jest.fn(async () => {}),
        startTransaction: jest.fn(async () => {}),
        commitTransaction: jest.fn(async () => {}),
        rollbackTransaction: jest.fn(async () => {}),
        release: jest.fn(async () => {}),
        manager: {
          findOne: jest.fn(async (entity: any) => {
            const name = entity?.name || '';
            if (name === 'Store') return store;
            if (name === 'User') {
              return { id: 'buyer-1', isActive: true, identification: 'V123456' };
            }
            if (name === 'StoreCustomerBlock') return null;
            if (name === 'Item') return { ...itemOverride, store };
            return null;
          }),
          create: jest.fn((_e: any, data: any) => data),
          save: jest.fn(async (d: any) => d),
        },
      };

      const dataSourceMock: any = {
        createQueryRunner: jest.fn(() => queryRunnerMock),
      };

      const service = new OrderService(
        { findOne: async () => null } as any,
        { findOneBy: async () => store, findOne: async () => store } as any,
        { findOne: async () => ({ ...itemOverride, store }) } as any,
        {} as any,
        {
          findOneBy: async () => ({
            id: 'buyer-1',
            isActive: true,
            identification: 'V123456',
          }),
        } as any,
        {} as any,
        {} as any,
        {} as any,
        dataSourceMock,
        {} as any,
        {} as any,
        { calculateCommission: async () => ({ rate: 0, commissionAmount: 0 }) } as any,
        {} as any,
        {} as any,
      );

      return service;
    }

    it('rechaza validar o crear orden directa con artículo ON_DEMAND', async () => {
      const onDemandItem = {
        id: 'item-od',
        title: 'Servicio a Medida',
        priceType: PriceType.ON_DEMAND,
        itemType: ItemType.SERVICE,
        isActive: true,
        isDeleted: false,
        hasVariants: false,
        trackInventory: false,
        price: 0,
      };
      const service = buildOrderService(onDemandItem);

      const valRes = await service.validateCart(
        { storeId: 'store-1', items: [{ itemId: 'item-od', quantity: 1 }] } as any,
        'buyer-1',
      );
      expect(valRes.isValid).toBe(false);
      expect(valRes.errors[0].code).toBe('ON_DEMAND_REQUIRES_QUOTE');

      await expect(
        service.create(
          { storeId: 'store-1', items: [{ itemId: 'item-od', quantity: 1 }] } as any,
          'buyer-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rechaza cantidad mayor a 1 para artículos FREE', async () => {
      const freeItem = {
        id: 'item-free',
        title: 'Muestra Promocional',
        priceType: PriceType.FREE,
        itemType: ItemType.PRODUCT,
        isActive: true,
        isDeleted: false,
        hasVariants: false,
        trackInventory: false,
        price: 0,
      };
      const service = buildOrderService(freeItem);

      const valRes = await service.validateCart(
        { storeId: 'store-1', items: [{ itemId: 'item-free', quantity: 2 }] } as any,
        'buyer-1',
      );
      expect(valRes.isValid).toBe(false);
      expect(valRes.errors.some((e) => e.code === 'FREE_ITEM_QTY_LIMIT')).toBe(
        true,
      );

      await expect(
        service.create(
          { storeId: 'store-1', items: [{ itemId: 'item-free', quantity: 2 }] } as any,
          'buyer-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('PaymentService.createWithOrder - Seguridad para ON_DEMAND y FREE', () => {
    function buildPaymentService(itemOverride: any) {
      const store = {
        id: 'store-1',
        name: 'Tienda Test',
        status: StoreStatus.ACTIVE,
        allowPartialPayments: true,
        owner: { id: 'owner-1' },
      };

      const queryRunnerMock: any = {
        connect: jest.fn(async () => {}),
        startTransaction: jest.fn(async () => {}),
        commitTransaction: jest.fn(async () => {}),
        rollbackTransaction: jest.fn(async () => {}),
        release: jest.fn(async () => {}),
        manager: {
          findOne: jest.fn(async (entity: any) => {
            const name = entity?.name || '';
            if (name === 'Store') return store;
            if (name === 'User') {
              return { id: 'buyer-1', isActive: true, identification: 'V123456' };
            }
            if (name === 'StoreCustomerBlock') return null;
            if (name === 'Item') return { ...itemOverride, store };
            return null;
          }),
        },
      };

      const dataSourceMock: any = {
        createQueryRunner: jest.fn(() => queryRunnerMock),
      };

      return new PaymentService(
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        dataSourceMock,
        {} as any,
        {} as any,
        { calculateCommission: async () => ({ rate: 0, commissionAmount: 0 }) } as any,
        {} as any,
        {} as any,
      );
    }

    it('rechaza createWithOrder para ON_DEMAND y para FREE con cantidad > 1', async () => {
      const paymentOnDemand = buildPaymentService({
        id: 'item-od',
        title: 'Servicio a Medida',
        priceType: PriceType.ON_DEMAND,
        itemType: ItemType.SERVICE,
        store: { id: 'store-1' },
      });

      await expect(
        paymentOnDemand.createWithOrder(
          {
            order: {
              storeId: 'store-1',
              items: [{ itemId: 'item-od', quantity: 1 }],
            },
            payment: { currency: 'USD' },
          } as any,
          'buyer-1',
        ),
      ).rejects.toThrow(BadRequestException);

      const paymentFree = buildPaymentService({
        id: 'item-free',
        title: 'Muestra Gratis',
        priceType: PriceType.FREE,
        itemType: ItemType.PRODUCT,
        store: { id: 'store-1' },
      });

      await expect(
        paymentFree.createWithOrder(
          {
            order: {
              storeId: 'store-1',
              items: [{ itemId: 'item-free', quantity: 2 }],
            },
            payment: { currency: 'USD' },
          } as any,
          'buyer-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
