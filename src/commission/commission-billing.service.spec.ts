jest.mock('@nestjs/common/utils/load-package.util', () => ({
  loadPackage: jest.fn(),
}));

jest.mock('@nestjs/typeorm', () => ({
  InjectRepository: () => () => undefined,
}));

jest.mock('../notification/notification.gateway', () => ({
  NotificationGateway: class {},
  AdminActionType: {},
}));

import { StoreCommissionBillingService } from './commission-billing.service';
import { BillingStatus, FineType, PaymentReportStatus } from './types';
import { StoreStatus } from 'src/store/types/status.enum';
import { NotificationType } from 'src/notification/entities/notification.entity';

describe('StoreCommissionBillingService notifications & debt hub', () => {
  let service: StoreCommissionBillingService;
  let mockBillingRepo: any;
  let mockReportRepo: any;
  let mockRangeRepo: any;
  let mockSettingsRepo: any;
  let mockPaymentMethodRepo: any;
  let mockStoreRepo: any;
  let mockOrderRepo: any;
  let mockMailService: any;
  let mockNotificationService: any;
  let mockPlatformSettingsService: any;

  beforeEach(() => {
    mockBillingRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      save: jest.fn().mockImplementation((e) => Promise.resolve(e)),
    };
    mockReportRepo = {
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
      save: jest.fn().mockImplementation((e) => Promise.resolve(e)),
    };
    mockRangeRepo = {};
    mockSettingsRepo = {
      findOne: jest.fn().mockResolvedValue({
        isEnabled: true,
        gracePeriodDays: 4,
        fineType: FineType.FIXED_USD,
        fineValue: 8,
      }),
    };
    mockPaymentMethodRepo = {
      find: jest.fn().mockResolvedValue([
        {
          id: 'pm-1',
          type: 'PAGO_MOVIL',
          title: 'Pago Móvil Banesco',
          accountDetails: { phone: '0414-0000000' },
          isActive: true,
        },
      ]),
    };
    mockStoreRepo = {
      findOne: jest.fn(),
      save: jest.fn().mockImplementation((e) => Promise.resolve(e)),
    };
    mockOrderRepo = {
      find: jest.fn().mockResolvedValue([]),
    };
    mockMailService = {
      sendCommissionPaymentApprovedNotice: jest
        .fn()
        .mockResolvedValue(undefined),
      sendCommissionPaymentRejectedNotice: jest
        .fn()
        .mockResolvedValue(undefined),
      sendStoreSuspendedForCommissions: jest.fn().mockResolvedValue(undefined),
    };
    mockNotificationService = {
      create: jest.fn().mockResolvedValue(undefined),
      notifyAdminBadgesChanged: jest.fn().mockResolvedValue(undefined),
    };
    mockPlatformSettingsService = {
      getExchangeRateConfig: jest.fn().mockResolvedValue({
        rate: 50,
        currency: 'USD',
      }),
    };

    service = new StoreCommissionBillingService(
      mockBillingRepo,
      mockReportRepo,
      mockRangeRepo,
      mockSettingsRepo,
      mockPaymentMethodRepo,
      mockStoreRepo,
      mockOrderRepo,
      mockMailService,
      mockNotificationService,
      mockPlatformSettingsService,
    );
  });

  it('extends getStoreDebtHub with settings, platformPaymentMethods and suspensionInfo', async () => {
    mockStoreRepo.findOne.mockResolvedValue({
      id: 'store-1',
      name: 'Tienda Norte',
      status: StoreStatus.SUSPENDED,
      accumulatedCommissionDebt: 32.5,
    });
    mockBillingRepo.findOne.mockResolvedValue({
      id: 'bill-1',
      status: BillingStatus.SUSPENDED,
      totalDue: 32.5,
    });
    mockReportRepo.find.mockResolvedValue([
      {
        id: 'rep-rej',
        amount: 32.5,
        status: PaymentReportStatus.REJECTED,
        rejectionReason: 'Comprobante duplicado',
        reviewedAt: new Date('2026-11-11T12:00:00Z'),
        createdAt: new Date('2026-11-11T10:00:00Z'),
      },
    ]);

    const hub = await service.getStoreDebtHub('store-1');

    expect(hub.settings).toEqual({
      isEnabled: true,
      gracePeriodDays: 4,
      fineType: FineType.FIXED_USD,
      fineValue: 8,
    });
    expect(hub.platformPaymentMethods).toHaveLength(1);
    expect(hub.suspensionInfo).toMatchObject({
      isSuspended: true,
      isSuspendedByDebt: true,
      hasPendingReport: false,
      latestRejectedReport: {
        id: 'rep-rej',
        amount: 32.5,
        rejectionReason: 'Comprobante duplicado',
      },
    });
  });

  it('approves payment report, reactivates suspended store, and notifies via email + push', async () => {
    const store = {
      id: 'store-1',
      name: 'Tienda Norte',
      status: StoreStatus.SUSPENDED,
      accumulatedCommissionDebt: 30,
      owner: null,
      company: { owner: { id: 'owner-1', email: 'norte@example.com' } },
    };
    const billing = {
      id: 'bill-1',
      status: BillingStatus.PAYMENT_REPORTED,
      totalDue: 30,
      paidAmount: 0,
      store,
    };
    mockReportRepo.findOne.mockResolvedValue({
      id: 'rep-1',
      amount: 30,
      status: PaymentReportStatus.PENDING_REVIEW,
      billing,
    });

    await service.reviewPaymentReport(
      'rep-1',
      { status: PaymentReportStatus.APPROVED },
      { id: 'admin-1' } as any,
    );

    expect(store.status).toBe(StoreStatus.ACTIVE);
    expect(store.accumulatedCommissionDebt).toBe(0);
    expect(billing.status).toBe(BillingStatus.PAID);
    expect(
      mockMailService.sendCommissionPaymentApprovedNotice,
    ).toHaveBeenCalledWith({
      email: 'norte@example.com',
      storeName: 'Tienda Norte',
      paidAmountUsd: 30,
      remainingDebtUsd: 0,
      reactivated: true,
    });
    expect(mockNotificationService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'owner-1',
        storeId: 'store-1',
        type: NotificationType.COMMISSION_PAYMENT_REVIEWED,
        targetId: 'rep-1',
        channelType: 'COMMISSION_DEBT',
      }),
    );
  });

  it('rejects payment report with reason, keeps suspended billing status, and notifies owner', async () => {
    const store = {
      id: 'store-2',
      name: 'Tienda Sur',
      status: StoreStatus.SUSPENDED,
      accumulatedCommissionDebt: 25,
      owner: { id: 'owner-2', email: 'sur@example.com' },
    };
    const billing = {
      id: 'bill-2',
      status: BillingStatus.PAYMENT_REPORTED,
      totalDue: 25,
      paidAmount: 0,
      store,
    };
    mockReportRepo.findOne.mockResolvedValue({
      id: 'rep-2',
      amount: 25,
      status: PaymentReportStatus.PENDING_REVIEW,
      billing,
    });

    await service.reviewPaymentReport(
      'rep-2',
      {
        status: PaymentReportStatus.REJECTED,
        rejectionReason: 'Número de referencia no coincide',
      },
      { id: 'admin-1' } as any,
    );

    expect(billing.status).toBe(BillingStatus.SUSPENDED);
    expect(
      mockMailService.sendCommissionPaymentRejectedNotice,
    ).toHaveBeenCalledWith({
      email: 'sur@example.com',
      storeName: 'Tienda Sur',
      reportedAmountUsd: 25,
      remainingDebtUsd: 25,
      rejectionReason: 'Número de referencia no coincide',
      isSuspended: true,
    });
    expect(mockNotificationService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'owner-2',
        storeId: 'store-2',
        type: NotificationType.COMMISSION_PAYMENT_REVIEWED,
        targetId: 'rep-2',
        channelType: 'COMMISSION_DEBT',
      }),
    );
  });
});
