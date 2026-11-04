import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ItemService } from './item.service';
import { Item } from './entities/item.entity';
import { PriceType } from './types/price-type.enum';
import { ItemType } from './types/item-type.enum';

describe('ItemService - Item-Level Commission Calculation', () => {
  const mockStore = {
    id: 'store-1',
    name: 'Tienda Test',
    isCommissionExempt: false,
    owner: { id: 'user-1' },
  } as any;

  const mockCommissionService = {
    calculateCommission: async (basePrice: number) => {
      // 5% rate for testing
      const rate = 5.0;
      const commissionAmount = Math.round(((basePrice * rate) / 100) * 100) / 100;
      return { rate, commissionAmount };
    },
  } as any;

  const commonMocks = {
    customizationGroupRepo: { find: async () => [] } as any,
    attributeValueRepo: { find: async () => [] } as any,
    variantAxisRepo: { find: async () => [] } as any,
    itemVariantRepo: { find: async () => [] } as any,
    templateRepo: { find: async () => [] } as any,
  };

  it('debe calcular commissionAmount y public price = basePrice + commissionAmount al crear', async () => {
    let savedItemData: any = null;

    const mockItemRepo = {
      create: (dto: any) => ({ ...dto }),
      save: async (item: any) => {
        savedItemData = item;
        return { id: 'item-1', ...item };
      },
      findOne: async () => savedItemData,
    } as any;

    const mockStoreRepo = {
      findOne: async () => mockStore,
    } as any;

    const mockCategoryRepo = {
      count: async () => 1,
      findOne: async () => ({ id: 'cat-1', store: mockStore }),
    } as any;

    const mockPaymentMethodRepo = {
      count: async () => 1,
    } as any;

    const service = new ItemService(
      mockItemRepo,
      mockStoreRepo,
      mockCategoryRepo,
      mockPaymentMethodRepo,
      commonMocks.templateRepo,
      commonMocks.customizationGroupRepo,
      {} as any,
      commonMocks.attributeValueRepo,
      commonMocks.variantAxisRepo,
      commonMocks.itemVariantRepo,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      { log: async () => {} } as any,
      mockCommissionService,
    );

    (service as any).saveCustomizationAndAttributes = async () => {};
    (service as any).saveVariantsAndAxes = async () => {};

    await service.create(
      {
        title: 'Hamburguesa Especial',
        description: 'Deliciosa hamburguesa con queso y papas',
        storeId: 'store-1',
        categoryId: 'cat-1',
        mainImage: 'https://example.com/burger.jpg',
        images: ['https://example.com/burger.jpg'],
        itemType: ItemType.PRODUCT,
        priceType: PriceType.FIXED,
        basePrice: 100.0,
        stockQuantity: 10,
      } as any,
      { id: 'user-1' } as any,
    );

    assert.equal(savedItemData.basePrice, 100.0);
    assert.equal(savedItemData.commissionRate, 5.0);
    assert.equal(savedItemData.commissionAmount, 5.0);
    assert.equal(savedItemData.price, 105.0);
  });

  it('debe recalcular commissionAmount y public price al actualizar basePrice', async () => {
    let savedItemData: any = null;

    const existingItem: Partial<Item> = {
      id: 'item-1',
      title: 'Hamburguesa',
      basePrice: 100.0,
      commissionRate: 5.0,
      commissionAmount: 5.0,
      price: 105.0,
      priceType: PriceType.FIXED,
      store: mockStore,
      isDeleted: false,
    };

    const mockItemRepo = {
      findOne: async () => existingItem,
      merge: (target: any, patch: any) => Object.assign(target, patch),
      save: async (item: any) => {
        savedItemData = item;
        return item;
      },
    } as any;

    const service = new ItemService(
      mockItemRepo,
      {} as any,
      {} as any,
      {} as any,
      commonMocks.templateRepo,
      commonMocks.customizationGroupRepo,
      {} as any,
      commonMocks.attributeValueRepo,
      commonMocks.variantAxisRepo,
      commonMocks.itemVariantRepo,
      { createQueryBuilder: () => ({ innerJoin: () => ({ where: () => ({ andWhere: () => ({ getCount: async () => 0 }) }) }) }) } as any,
      { createQueryBuilder: () => ({ innerJoin: () => ({ innerJoin: () => ({ where: () => ({ andWhere: () => ({ getCount: async () => 0 }) }) }) }) }) } as any,
      {} as any,
      {} as any,
      {} as any,
      { log: async () => {} } as any,
      mockCommissionService,
    );

    (service as any).saveCustomizationAndAttributes = async () => {};
    (service as any).saveVariantsAndAxes = async () => {};
    (service as any).findOne = async () => savedItemData;

    // Actualizamos basePrice a 80
    await service.update(
      'item-1',
      {
        basePrice: 80.0,
      } as any,
      { id: 'user-1' } as any,
    );

    assert.equal(savedItemData.basePrice, 80.0);
    assert.equal(savedItemData.commissionRate, 5.0);
    assert.equal(savedItemData.commissionAmount, 4.0); // 5% de 80 = 4.0
    assert.equal(savedItemData.price, 84.0); // 80 + 4 = 84.0
  });

  it('debe asignar precio base del padre y calcular comisiones en variantes sin precio explícito y fijar STARTING_AT si difieren', async () => {
    let savedItemData: any = null;
    const variantsSaved: any[] = [];

    const mockItemRepo = {
      findOne: async () => ({
        id: 'item-variants-test',
        title: 'Vestido Lola',
        basePrice: 20.0,
        price: 23.1,
        commissionRate: 15.5,
        commissionAmount: 3.1,
        store: { id: 'store-1', isCommissionExempt: false },
        category: { id: 'cat-1' },
      }),
      save: async (item: any) => {
        savedItemData = item;
        return item;
      },
    } as any;

    const mockItemVariantRepo = {
      find: async () => variantsSaved,
      create: (data: any) => data,
      save: async (v: any) => {
        variantsSaved.push(v);
        return v;
      },
      remove: async () => {},
    } as any;

    const mockVariantAxisRepo = {
      delete: async () => {},
      create: (data: any) => data,
      save: async (a: any) => a,
    } as any;

    const service = new ItemService(
      mockItemRepo,
      {} as any,
      {} as any,
      {} as any,
      commonMocks.templateRepo,
      commonMocks.customizationGroupRepo,
      {} as any,
      commonMocks.attributeValueRepo,
      mockVariantAxisRepo,
      mockItemVariantRepo,
      { count: async () => 0 } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      { log: async () => {} } as any,
      mockCommissionService,
    );

    const testItem = {
      id: 'item-variants-test',
      title: 'Vestido Lola',
      basePrice: 20.0,
      price: 23.1,
      store: { id: 'store-1' },
      variantAxes: [{ name: 'Talla', values: ['S', 'M'] }],
    } as any;

    await (service as any).saveVariantsAndAxes(
      testItem,
      'Tienda Test',
      true,
      [{ name: 'Talla', values: ['S', 'M'] }],
      [
        { axisValues: { Talla: 'S' } }, // Sin precio explícito, debe heredar basePrice=20 y calcular comision
        { axisValues: { Talla: 'M' }, basePrice: 25.0 }, // Con precio explícito de 25
      ],
    );

    // Verificamos que la variante sin precio heredó basePrice=20 y calculó comisión
    const v1 = variantsSaved.find((v) => v.axisValues?.Talla === 'S');
    assert.ok(v1);
    assert.equal(v1.basePrice, 20.0);
    assert.equal(v1.commissionAmount, 1.0); // 5% de 20 en mockCommissionService
    assert.equal(v1.price, 21.0);

    // Verificamos que el item resultante tiene STARTING_AT y el precio mínimo
    assert.ok(savedItemData);
    assert.equal(savedItemData.priceType, 'STARTING_AT');
    assert.equal(savedItemData.price, 21.0);
    assert.equal(savedItemData.basePrice, 20.0);
  });

  it('debe persistir isActive = false para combinaciones desmarcadas por el comerciante incluso con sufijos hex o imagen', async () => {
    const variantsSaved: any[] = [];

    const mockItemRepo = {
      findOne: async () => ({
        id: 'item-inactive-combo-test',
        title: 'Franelilla Deportiva',
        basePrice: 15.0,
        price: 17.33,
        store: { id: 'store-1', isCommissionExempt: false },
        category: { id: 'cat-1' },
      }),
      save: async (item: any) => item,
    } as any;

    const mockItemVariantRepo = {
      find: async () => [],
      create: (data: any) => data,
      save: async (v: any) => {
        variantsSaved.push(v);
        return v;
      },
      remove: async () => {},
    } as any;

    const mockVariantAxisRepo = {
      delete: async () => {},
      create: (data: any) => data,
      save: async (a: any) => a,
    } as any;

    const service = new ItemService(
      mockItemRepo,
      {} as any,
      {} as any,
      {} as any,
      commonMocks.templateRepo,
      commonMocks.customizationGroupRepo,
      {} as any,
      commonMocks.attributeValueRepo,
      mockVariantAxisRepo,
      mockItemVariantRepo,
      { count: async () => 0 } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      { log: async () => {} } as any,
      mockCommissionService,
    );

    const testItem = {
      id: 'item-inactive-combo-test',
      title: 'Franelilla Deportiva',
      basePrice: 15.0,
      price: 17.33,
      store: { id: 'store-1' },
    } as any;

    await (service as any).saveVariantsAndAxes(
      testItem,
      'Tienda Test',
      true,
      [
        { name: 'Talla', values: ['S', 'M'] },
        {
          name: 'Color',
          values: [
            'Rojo Carmín|#EF4444|/uploads/rojo.png',
            'Verde|#22C55E|/uploads/verde.png',
          ],
        },
      ],
      [
        {
          axisValues: { Talla: 'S', Color: 'Rojo Carmín|#EF4444' },
          stockQuantity: 1,
          isActive: true,
        },
        {
          axisValues: { Talla: 'S', color: 'Verde' },
          stockQuantity: 0,
          isActive: false,
        },
        {
          axisValues: { Talla: 'M', Color: 'Rojo Carmín' },
          stockQuantity: 0,
          isActive: false,
        },
        {
          axisValues: { Talla: 'M', Color: 'Verde|#22C55E|/uploads/verde.png' },
          stockQuantity: 3,
          isActive: true,
        },
      ],
    );

    assert.equal(variantsSaved.length, 4);
    const sVerde = variantsSaved.find(
      (v) =>
        v.axisValues?.Talla === 'S' &&
        v.axisValues?.Color?.startsWith('Verde'),
    );
    const mRojo = variantsSaved.find(
      (v) =>
        v.axisValues?.Talla === 'M' &&
        v.axisValues?.Color?.startsWith('Rojo Carmín'),
    );
    const sRojo = variantsSaved.find(
      (v) =>
        v.axisValues?.Talla === 'S' &&
        v.axisValues?.Color?.startsWith('Rojo Carmín'),
    );
    assert.ok(sVerde);
    assert.equal(sVerde.isActive, false);
    assert.ok(mRojo);
    assert.equal(mRojo.isActive, false);
    assert.ok(sRojo);
    assert.equal(sRojo.isActive, true);
  });
});
