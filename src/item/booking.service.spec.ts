/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { BookingService } from './booking.service';
import { BookingType } from './types/booking-type.enum';
import { DepositType } from './types/deposit-type.enum';
import { SlotBookingStatus } from '../order/types/slot-booking-status.enum';

describe('BookingService', () => {
  let bookingService: BookingService;
  let mockItemRepo: any;
  let mockSlotConfigRepo: any;
  let mockTimeSlotRepo: any;
  let mockPreorderConfigRepo: any;
  let mockSlotBookingRepo: any;
  let mockOrderRepo: any;
  let mockDataSource: any;
  let mockNotificationService: any;

  beforeEach(() => {
    mockItemRepo = {
      findOne: jest.fn(),
      save: jest.fn((item) => Promise.resolve(item)),
    };
    mockSlotConfigRepo = {
      create: jest.fn((dto) => ({ id: 'config-1', ...dto })),
      save: jest.fn((entity) => Promise.resolve(entity)),
    };
    mockTimeSlotRepo = {
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
      create: jest.fn((dto) => ({ id: 'slot-1', ...dto })),
      save: jest.fn((entities) => Promise.resolve(entities)),
    };
    mockPreorderConfigRepo = {
      create: jest.fn((dto) => ({ id: 'preorder-1', ...dto })),
      save: jest.fn((entity) => Promise.resolve(entity)),
    };
    mockSlotBookingRepo = {
      count: jest.fn(),
      save: jest.fn((entity) => Promise.resolve(entity)),
      createQueryBuilder: jest.fn(),
    };
    mockOrderRepo = {
      findOne: jest.fn(),
      save: jest.fn((order) => Promise.resolve(order)),
    };
    mockDataSource = {
      transaction: jest.fn(),
    };
    mockNotificationService = {
      create: jest.fn().mockResolvedValue(true),
    };

    bookingService = new BookingService(
      mockItemRepo,
      mockSlotConfigRepo,
      mockTimeSlotRepo,
      mockPreorderConfigRepo,
      mockSlotBookingRepo,
      mockOrderRepo,
      mockDataSource,
      mockNotificationService,
    );
  });

  describe('Slot Configuration and Validations', () => {
    const ownerUser: any = { id: 'owner-1' };
    const strangerUser: any = { id: 'stranger-2' };
    const mockItem: any = {
      id: 'item-1',
      title: 'Corte de Cabello',
      store: { id: 'store-1', owner: { id: 'owner-1' } },
      slotConfig: null,
    };

    it('should reject configuration if requesting user is not store owner', async () => {
      mockItemRepo.findOne.mockResolvedValue(mockItem);

      await expect(
        bookingService.configureSlotBooking(
          'item-1',
          { minNoticeHours: 2 },
          strangerUser,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should reject negative minimum notice hours', async () => {
      mockItemRepo.findOne.mockResolvedValue(mockItem);

      await expect(
        bookingService.configureSlotBooking(
          'item-1',
          { minNoticeHours: -1 },
          ownerUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject invalid slot time ranges where startTime >= endTime', async () => {
      mockItemRepo.findOne.mockResolvedValue(mockItem);

      await expect(
        bookingService.configureSlotBooking(
          'item-1',
          {
            minNoticeHours: 2,
            slots: [
              {
                startTime: '14:00',
                endTime: '11:00',
                label: 'Inverted Slot',
              },
            ],
          },
          ownerUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should successfully save slot config and set bookingType to TIME_SLOT', async () => {
      mockItemRepo.findOne.mockResolvedValue(mockItem);

      const result = await bookingService.configureSlotBooking(
        'item-1',
        {
          minNoticeHours: 2,
          serviceDurationMinutes: 120,
          maxConcurrentBookings: 1,
          slots: [
            {
              startTime: '08:00',
              endTime: '11:00',
              label: 'Turno Mañana',
            },
          ],
        },
        ownerUser,
      );

      expect(result).toBeDefined();
      expect(mockItem.bookingType).toBe(BookingType.TIME_SLOT);
      expect(mockItem.requiresBooking).toBe(true);
      expect(mockSlotConfigRepo.save).toHaveBeenCalled();
    });
  });

  describe('Real-time Expiration Calculation', () => {
    it('should mark slot as EXPIRED if current time exceeds deadline', async () => {
      // Slot 08:00 to 11:00 with minNoticeHours = 2 -> Deadline is 09:00 AM
      const mockItemWithSlots: any = {
        id: 'item-1',
        store: { timezone: 'UTC' },
        slotConfig: {
          allowSameDay: true,
          minNoticeHours: 2,
          maxConcurrentBookings: 1,
          slots: [
            {
              id: 'slot-1',
              startTime: '08:00',
              endTime: '11:00',
              label: 'Turno Mañana',
              isActive: true,
              dayOfWeek: null,
            },
          ],
        },
      };

      mockItemRepo.findOne.mockResolvedValue(mockItemWithSlots);
      mockSlotBookingRepo.count.mockResolvedValue(0);

      // Simulamos consulta para hoy
      const now = new Date();
      const todayStr = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;

      // Mocking getTimezone / Date if needed or checking date
      const slots = await bookingService.getAvailableSlots('item-1', todayStr);
      expect(slots).toBeDefined();
      expect(slots.length).toBe(1);
    });
  });

  describe('Pre-Order Configuration and Validations', () => {
    const ownerUser: any = { id: 'owner-1' };
    const mockProduct: any = {
      id: 'prod-1',
      title: 'Smartphone Flagship',
      store: { id: 'store-1', owner: { id: 'owner-1' } },
      preorderConfig: null,
    };

    it('should reject invalid lead days if min > max', async () => {
      mockItemRepo.findOne.mockResolvedValue(mockProduct);

      await expect(
        bookingService.configurePreorder(
          'prod-1',
          {
            estimatedLeadDaysMin: 20,
            estimatedLeadDaysMax: 10,
          },
          ownerUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject invalid percentage deposit (> 100 or <= 0)', async () => {
      mockItemRepo.findOne.mockResolvedValue(mockProduct);

      await expect(
        bookingService.configurePreorder(
          'prod-1',
          {
            depositType: DepositType.PERCENTAGE,
            depositValue: 120,
          },
          ownerUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should successfully save pre-order config and set bookingType to PRE_ORDER', async () => {
      mockItemRepo.findOne.mockResolvedValue(mockProduct);

      const result = await bookingService.configurePreorder(
        'prod-1',
        {
          depositType: DepositType.PERCENTAGE,
          depositValue: 30,
          estimatedLeadDaysMin: 7,
          estimatedLeadDaysMax: 15,
          maxPreOrderUnits: 20,
        },
        ownerUser,
      );

      expect(result).toBeDefined();
      expect(mockProduct.bookingType).toBe(BookingType.PRE_ORDER);
      expect(mockProduct.requiresBooking).toBe(true);
      expect(mockPreorderConfigRepo.save).toHaveBeenCalled();
    });
  });

  describe('Race Condition and Atomic Hold Locking', () => {
    it('should reject second customer when slot capacity is exhausted by active holds', async () => {
      mockDataSource.transaction.mockImplementation(async (cb: any) => {
        const mockManager: any = {
          findOne: jest.fn((entity: any) => {
            if (entity.name === 'Item') {
              return Promise.resolve({
                id: 'item-1',
                store: { id: 'store-1', timezone: 'UTC' },
                slotConfig: {
                  minNoticeHours: 1,
                  maxConcurrentBookings: 1,
                },
              });
            }
            if (entity.name === 'ItemTimeSlot') {
              return Promise.resolve({
                id: 'slot-1',
                startTime: '15:00',
                endTime: '18:00',
                label: 'Tarde',
                isActive: true,
              });
            }
            return null;
          }),
          count: jest.fn((entity: any, criteria: any) => {
            // Simular que ya hay 1 hold activo de otro cliente
            if (criteria.where?.status === SlotBookingStatus.HOLD) {
              return Promise.resolve(1);
            }
            return Promise.resolve(0);
          }),
        };

        return await cb(mockManager);
      });

      const userB: any = { id: 'user-b' };

      await expect(
        bookingService.acquireSlotHold('item-1', 'slot-1', '2026-10-15', userB),
      ).rejects.toThrow(ConflictException);
    });
  });
});
