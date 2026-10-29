import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { StoreCommissionBillingService } from './commission-billing.service';
import { StoreCommissionBilling } from './entities/store-commission-billing.entity';
import { CommissionPaymentReport } from './entities/commission-payment-report.entity';
import { CommissionConfigRange } from './entities/commission-config-range.entity';
import { CommissionSettings } from './entities/commission-settings.entity';
import { PlatformPaymentMethod } from './entities/platform-payment-method.entity';
import { Store } from 'src/store/entities/store.entity';
import { Order } from 'src/order/entities/order.entity';
import { MailService } from 'src/common/mail/mail.service';
import { NotificationService } from 'src/notification/notification.service';
import { BillingStatus } from './types';
import { OrderStatus } from 'src/order/types';

describe('StoreCommissionBillingService - Metrics', () => {
  let service: StoreCommissionBillingService;
  let mockBillingRepo: any;
  let mockStoreRepo: any;
  let mockOrderRepo: any;

  beforeEach(async () => {
    mockBillingRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };

    mockStoreRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      createQueryBuilder: jest.fn(),
    };

    mockOrderRepo = {
      find: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StoreCommissionBillingService,
        {
          provide: getRepositoryToken(StoreCommissionBilling),
          useValue: mockBillingRepo,
        },
        {
          provide: getRepositoryToken(CommissionPaymentReport),
          useValue: {},
        },
        {
          provide: getRepositoryToken(CommissionConfigRange),
          useValue: {},
        },
        {
          provide: getRepositoryToken(CommissionSettings),
          useValue: {},
        },
        {
          provide: getRepositoryToken(PlatformPaymentMethod),
          useValue: {},
        },
        {
          provide: getRepositoryToken(Store),
          useValue: mockStoreRepo,
        },
        {
          provide: getRepositoryToken(Order),
          useValue: mockOrderRepo,
        },
        {
          provide: MailService,
          useValue: { sendWeeklyCommissionInvoice: jest.fn() },
        },
        {
          provide: NotificationService,
          useValue: { notifyAdminActionRequired: jest.fn(), notifyAdminBadgesChanged: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<StoreCommissionBillingService>(StoreCommissionBillingService);
  });

  it('should compute collected, pending, and gross volume metrics accurately', async () => {
    const now = new Date();

    // Mock paid billings (collected)
    mockBillingRepo.find.mockImplementation(async ({ where }: any) => {
      if (where && where.status === BillingStatus.PAID) {
        return [
          { commissionAmount: 25.5, createdAt: now },
          { commissionAmount: 50.0, createdAt: now },
        ];
      }
      if (where && where.status && Array.isArray(where.status._value || where.status)) {
        return [
          { totalDue: 100, paidAmount: 20 },
        ];
      }
      return [];
    });

    // Mock stores with debt
    mockStoreRepo.createQueryBuilder.mockReturnValue({
      where: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([
        { id: 'store-1', accumulatedCommissionDebt: 150.75 },
        { id: 'store-2', accumulatedCommissionDebt: 49.25 },
      ]),
    });

    // Mock valid orders for gross volume
    mockOrderRepo.find.mockResolvedValue([
      { id: 'order-1', finalAmount: 200, createdAt: now },
      { id: 'order-2', finalAmount: 300, createdAt: now },
    ]);

    const result = await service.getCommissionMetrics();

    expect(result.collected.today).toBe(75.5);
    expect(result.pending.unbilledDebt).toBe(200);
    expect(result.pending.totalReceivable).toBe(200);
    expect(result.pending.pendingStoresCount).toBe(2);
    expect(result.grossVolume.today).toBe(500);
  });
});
