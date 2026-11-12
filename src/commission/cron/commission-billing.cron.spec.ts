jest.mock('@nestjs/common/utils/load-package.util', () => ({
  loadPackage: jest.fn(),
}));

jest.mock('@nestjs/typeorm', () => ({
  InjectRepository: () => () => undefined,
}));

jest.mock('@nestjs/schedule', () => ({
  Cron: () => () => undefined,
}));

import { CommissionBillingCron } from './commission-billing.cron';
import { BillingStatus, FineType } from '../types';
import { StoreStatus } from 'src/store/types/status.enum';
import { NotificationType } from 'src/notification/entities/notification.entity';

describe('CommissionBillingCron', () => {
  let cron: CommissionBillingCron;
  let mockBillingRepo: any;
  let mockSettingsRepo: any;
  let mockStoreRepo: any;
  let mockOrderRepo: any;
  let mockReportRepo: any;
  let mockPaymentMethodRepo: any;
  let mockMailService: any;
  let mockNotificationService: any;
  let mockPlatformSettingsService: any;

  beforeEach(() => {
    jest.useFakeTimers();
    mockBillingRepo = {
      find: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockImplementation((dto) => ({ id: 'bill-new', ...dto })),
      save: jest.fn().mockImplementation((entity) => Promise.resolve(entity)),
    };
    mockSettingsRepo = {
      findOne: jest.fn().mockResolvedValue({
        isEnabled: true,
        gracePeriodDays: 3,
        fineType: FineType.PERCENTAGE,
        fineValue: 10,
      }),
    };
    mockStoreRepo = {
      find: jest.fn().mockResolvedValue([]),
      save: jest.fn().mockImplementation((entity) => Promise.resolve(entity)),
    };
    mockOrderRepo = {
      find: jest.fn().mockResolvedValue([]),
    };
    mockReportRepo = {
      count: jest.fn().mockResolvedValue(0),
    };
    mockPaymentMethodRepo = {
      find: jest.fn().mockResolvedValue([
        {
          id: 'pm-1',
          title: 'Pago Móvil',
          accountDetails: { banco: 'Banesco', telefono: '0414-1234567' },
        },
      ]),
    };
    mockMailService = {
      sendWeeklyCommissionInvoice: jest.fn().mockResolvedValue(undefined),
      sendCommissionPreCutReminder: jest.fn().mockResolvedValue(undefined),
      sendCommissionGraceReminder: jest.fn().mockResolvedValue(undefined),
      sendStoreSuspendedForCommissions: jest.fn().mockResolvedValue(undefined),
    };
    mockNotificationService = {
      create: jest.fn().mockResolvedValue(undefined),
      hasNotificationForTargetSince: jest.fn().mockResolvedValue(false),
    };
    mockPlatformSettingsService = {
      getExchangeRateConfig: jest.fn().mockResolvedValue({
        rate: 50,
        currency: 'USD',
      }),
    };

    cron = new CommissionBillingCron(
      mockBillingRepo,
      mockSettingsRepo,
      mockStoreRepo,
      mockOrderRepo,
      mockReportRepo,
      mockPaymentMethodRepo,
      mockMailService,
      mockNotificationService,
      mockPlatformSettingsService,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('sends Sat/Sun pre-cut weekend reminder via email + single live notification when debt > 0', async () => {
    // Saturday 2026-11-14 09:00 AM VET (13:00 UTC)
    jest.setSystemTime(new Date('2026-11-14T13:00:00.000Z'));

    mockStoreRepo.find.mockResolvedValue([
      {
        id: 'store-1',
        name: 'Bodega Central',
        status: StoreStatus.ACTIVE,
        isCommissionExempt: false,
        accumulatedCommissionDebt: 15,
        owner: null,
        company: { owner: { id: 'owner-1', email: 'dueno@bodega.com' } },
      },
    ]);

    await cron.handleDailyCommissionReminders();

    expect(mockMailService.sendCommissionPreCutReminder).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'dueno@bodega.com',
        storeName: 'Bodega Central',
        accumulatedAmount: 15,
        gracePeriodDays: 3,
      }),
    );
    expect(mockNotificationService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'owner-1',
        storeId: 'store-1',
        type: NotificationType.COMMISSION_DEBT_REMINDER,
        targetId: 'precut:store-1:2026-11-16',
        channelType: 'COMMISSION_DEBT',
      }),
    );
  });

  it('sends grace countdown reminder and skips stores with pending payment review', async () => {
    // Tuesday 2026-11-10 09:00 AM VET (due Wednesday 2026-11-11 23:59 VET => D-1)
    jest.setSystemTime(new Date('2026-11-10T13:00:00.000Z'));

    mockBillingRepo.find
      .mockResolvedValueOnce([
        {
          id: 'bill-active',
          commissionAmount: 40,
          totalDue: 40,
          paidAmount: 0,
          dueDate: new Date('2026-11-12T03:59:59.000Z'),
          gracePeriodEndDate: new Date('2026-11-12T03:59:59.000Z'),
          status: BillingStatus.PENDING,
          store: {
            id: 'store-a',
            name: 'Tienda A',
            status: StoreStatus.ACTIVE,
            isCommissionExempt: false,
            owner: { id: 'user-a', email: 'a@example.com' },
          },
        },
        {
          id: 'bill-pending-review',
          commissionAmount: 20,
          totalDue: 20,
          paidAmount: 0,
          dueDate: new Date('2026-11-12T03:59:59.000Z'),
          gracePeriodEndDate: new Date('2026-11-12T03:59:59.000Z'),
          status: BillingStatus.PENDING,
          store: {
            id: 'store-b',
            name: 'Tienda B',
            status: StoreStatus.ACTIVE,
            isCommissionExempt: false,
            owner: { id: 'user-b', email: 'b@example.com' },
          },
        },
      ])
      .mockResolvedValueOnce([]);

    mockReportRepo.count.mockImplementation(async (opts: any) =>
      opts?.where?.billing?.store?.id === 'store-b' ? 1 : 0,
    );

    await cron.handleDailyCommissionReminders();

    expect(mockMailService.sendCommissionGraceReminder).toHaveBeenCalledTimes(1);
    expect(mockMailService.sendCommissionGraceReminder).toHaveBeenCalledWith(
      'a@example.com',
      'Tienda A',
      40,
      expect.objectContaining({ daysRemaining: 1, finePreviewAmount: 4 }),
    );
    expect(mockNotificationService.create).toHaveBeenCalledTimes(1);
    expect(mockNotificationService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        targetId: 'bill-active',
        storeId: 'store-a',
        type: NotificationType.COMMISSION_DEBT_REMINDER,
      }),
    );
  });

  it('suspends expired billings nightly, adds fine, sends email and emits STORE_SUSPENDED push/in-app', async () => {
    jest.setSystemTime(new Date('2026-11-12T03:59:30.000Z'));

    const billing = {
      id: 'bill-exp',
      commissionAmount: 50,
      fineAmount: 0,
      totalDue: 50,
      paidAmount: 0,
      gracePeriodEndDate: new Date('2026-11-12T03:00:00.000Z'),
      status: BillingStatus.PENDING,
      store: {
        id: 'store-exp',
        name: 'Moda Sur',
        status: StoreStatus.ACTIVE,
        isCommissionExempt: false,
        accumulatedCommissionDebt: 50,
        owner: { id: 'user-exp', email: 'moda@example.com' },
      },
    };
    mockBillingRepo.find.mockResolvedValueOnce([billing]);

    await cron.handleCommissionSuspensionAndFines();

    expect(billing.status).toBe(BillingStatus.SUSPENDED);
    expect(billing.fineAmount).toBe(5);
    expect(billing.store.status).toBe(StoreStatus.SUSPENDED);
    expect(billing.store.accumulatedCommissionDebt).toBe(55);

    expect(
      mockMailService.sendStoreSuspendedForCommissions,
    ).toHaveBeenCalledWith(
      'moda@example.com',
      'Moda Sur',
      55,
      5,
      expect.objectContaining({ baseCommission: 50 }),
    );
    expect(mockNotificationService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-exp',
        storeId: 'store-exp',
        targetId: 'store-exp',
        type: NotificationType.STORE_SUSPENDED,
        channelType: 'COMMISSION_DEBT',
        suspensionReason: 'COMMISSION_DEBT',
      }),
    );
  });
});
