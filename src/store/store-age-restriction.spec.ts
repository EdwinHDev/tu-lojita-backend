import { ForbiddenException } from '@nestjs/common';
import { StoreService } from './store.service';
import { Store } from './entities/store.entity';
import { User, isUserAdult } from 'src/user/entities/user.entity';
import { UserRole } from 'src/user/types/user-role.enum';
import { ItemService } from 'src/item/item.service';
import { Item } from 'src/item/entities/item.entity';

describe('Adult Content Age Restriction (Store & Item)', () => {
  let storeService: StoreService;
  let itemService: ItemService;

  const adultUser: User = {
    id: 'adult-uuid',
    birthDate: new Date('1995-01-01'),
    role: UserRole.USER,
  } as User;

  const minorUser: User = {
    id: 'minor-uuid',
    birthDate: new Date('2015-05-15'),
    role: UserRole.USER,
  } as User;

  const unverifiedUser: User = {
    id: 'unverified-uuid',
    role: UserRole.USER,
  } as User;

  describe('isUserAdult helper', () => {
    it('should correctly classify adult vs minor vs unverified', () => {
      expect(isUserAdult(adultUser)).toBe(true);
      expect(isUserAdult(minorUser)).toBe(false);
      expect(isUserAdult(unverifiedUser)).toBe(false);
      expect(isUserAdult(null)).toBe(false);
      expect(isUserAdult(undefined)).toBe(false);
    });
  });

  describe('StoreService.findOne age restriction', () => {
    const mockStoreRepo = {
      findOne: jest.fn(),
      count: jest.fn(),
    };
    const mockItemRepo = {
      count: jest.fn(),
    };
    const mockRankingService = {
      getLeaderboard: jest.fn(),
    };

    beforeEach(() => {
      jest.clearAllMocks();
      storeService = new StoreService(
        mockStoreRepo as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        mockItemRepo as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        mockRankingService as any,
        {} as any,
      );
    });

    it('should throw ForbiddenException (AGE_RESTRICTED) when store is +18 and user is minor', async () => {
      const store18: Partial<Store> = {
        id: 'store-18-id',
        name: 'Vape & Tobacco +18',
        isAgeRestricted: true,
      };
      mockStoreRepo.findOne.mockResolvedValue(store18);

      await expect(storeService.findOne('store-18-id', minorUser)).rejects.toThrow(
        ForbiddenException,
      );

      try {
        await storeService.findOne('store-18-id', minorUser);
      } catch (err: any) {
        expect(err.getResponse()).toMatchObject({
          code: 'AGE_RESTRICTED',
          message: 'Esta tienda está restringida a mayores de 18 años',
        });
      }
    });

    it('should throw ForbiddenException when store is +18 and user is unverified', async () => {
      const store18: Partial<Store> = {
        id: 'store-18-id',
        isAgeRestricted: true,
      };
      mockStoreRepo.findOne.mockResolvedValue(store18);

      await expect(storeService.findOne('store-18-id', unverifiedUser)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should allow access when store is +18 and user is adult', async () => {
      const store18: Partial<Store> = {
        id: 'store-18-id',
        isAgeRestricted: true,
      };
      mockStoreRepo.findOne.mockResolvedValue(store18);
      mockStoreRepo.count.mockResolvedValue(0);
      mockItemRepo.count.mockResolvedValue(5);

      const result = await storeService.findOne('store-18-id', adultUser);
      expect(result).toBeDefined();
      expect(result.id).toBe('store-18-id');
    });

    it('should allow minor access when store is not age restricted', async () => {
      const regularStore: Partial<Store> = {
        id: 'regular-store-id',
        isAgeRestricted: false,
      };
      mockStoreRepo.findOne.mockResolvedValue(regularStore);
      mockStoreRepo.count.mockResolvedValue(0);
      mockItemRepo.count.mockResolvedValue(2);

      const result = await storeService.findOne('regular-store-id', minorUser);
      expect(result).toBeDefined();
      expect(result.id).toBe('regular-store-id');
    });
  });

  describe('ItemService.findOne age restriction', () => {
    const mockItemRepo = {
      findOne: jest.fn(),
    };

    const mockCustomizationGroupRepo = {
      find: jest.fn().mockResolvedValue([]),
    };

    beforeEach(() => {
      jest.clearAllMocks();
      itemService = new ItemService(
        mockItemRepo as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        mockCustomizationGroupRepo as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
      );
    });

    it('should throw ForbiddenException (AGE_RESTRICTED) when item is +18 and user is minor', async () => {
      const item18: Partial<Item> = {
        id: 'item-18-id',
        title: 'Cerveza Artesanal +18',
        isAgeRestricted: true,
        store: { id: 's1', isAgeRestricted: false } as Store,
      };
      mockItemRepo.findOne.mockResolvedValue(item18);

      await expect(itemService.findOne('item-18-id', minorUser)).rejects.toThrow(
        ForbiddenException,
      );

      try {
        await itemService.findOne('item-18-id', minorUser);
      } catch (err: any) {
        expect(err.getResponse()).toMatchObject({
          code: 'AGE_RESTRICTED',
          message: 'Este producto está restringido a mayores de 18 años',
        });
      }
    });

    it('should throw ForbiddenException when item is regular but store is +18', async () => {
      const itemInAdultStore: Partial<Item> = {
        id: 'item-store-18',
        title: 'Encendedor',
        isAgeRestricted: false,
        store: { id: 's1', isAgeRestricted: true } as Store,
      };
      mockItemRepo.findOne.mockResolvedValue(itemInAdultStore);

      await expect(itemService.findOne('item-store-18', minorUser)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should allow access to +18 item when user is adult', async () => {
      const item18: Partial<Item> = {
        id: 'item-18-id',
        isAgeRestricted: true,
        store: { id: 's1', isAgeRestricted: false } as Store,
        customizationGroupsRel: [],
        attributesRel: [],
        variantAxes: [],
        variants: [],
      };
      mockItemRepo.findOne.mockResolvedValue(item18);

      const result = await itemService.findOne('item-18-id', adultUser);
      expect(result).toBeDefined();
      expect(result.id).toBe('item-18-id');
    });
  });
});
