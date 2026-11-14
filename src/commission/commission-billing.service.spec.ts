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

import { ForbiddenException } from '@nestjs/common';
import { StoreCommissionBillingService } from './commission-billing.service';
import { BillingStatus, FineType, PaymentReportStatus } from './types';
import { StoreStatus } from 'src/store/types/status.enum';
import { NotificationType } from 'src/notification/entities/notification.entity';
import { UserRole } from 'src/user/types/user-role.enum';

describe('StoreCommissionBillingService notifications & debt hub', () => {
  let service: StoreCommissionBillingService;
  let mockBillingRepo: any;
  let mockReportRepo: any;
  let mockRangeRepo: any;
  let mockSettingsRepo: any;
  let mockPaymentMethodRepo: any;
  let mockStoreRepo: any;
  let mockOrderRepo: any;
  let mockOrderItemRepo: any;
  let mockOrderItemQb: any;
  let mockMailService: any;
  let mockNotificationService: any;
  let mockPlatformSettingsService: any;

  beforeEach(() => {
    mockBillingRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockResolvedValue([]),
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
      findAndCount: jest.fn().mockResolvedValue([[], 0]),
      count: jest.fn().mockResolvedValue(0),
    };
    mockOrderItemQb = {
      leftJoin: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };
    mockOrderItemRepo = {
      createQueryBuilder: jest.fn(() => mockOrderItemQb),
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
      mockOrderItemRepo,
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

  it('paginates store commission orders 20-by-20 with batched variant-first thumbnail resolution', async () => {
    mockStoreRepo.findOne.mockResolvedValue({
      id: 'store-1',
      name: 'Tienda Norte',
      owner: { id: 'owner-1' },
      company: { id: 'comp-1', owner: { id: 'owner-1' } },
    });
    const fakeOrders = Array.from({ length: 20 }, (_, i) => ({
      id: `ord-${i + 1}`,
      totalAmount: 100,
      finalAmount: 100,
      platformCommissionRate: 5,
      platformCommissionAmount: 5,
      isPartialPayment: false,
      status: 'FULLY_PAID',
      createdAt: new Date('2026-11-12T10:00:00Z'),
    }));
    mockOrderRepo.findAndCount.mockResolvedValue([fakeOrders, 45]);
    mockOrderItemQb.getMany.mockResolvedValue([
      {
        id: 'oi-1',
        title: 'Producto Sin Foto',
        order: { id: 'ord-1' },
        item: { title: 'Producto Sin Foto', mainImage: null, images: [] },
        variant: null,
      },
      {
        id: 'oi-2',
        title: 'Taladro 20V',
        order: { id: 'ord-1' },
        item: { title: 'Taladro 20V', mainImage: '/img/item-1.webp' },
        variant: { imageUrl: '/img/var-1.webp' },
      },
      {
        id: 'oi-3',
        title: 'Pintura Roja',
        order: { id: 'ord-2' },
        item: { title: 'Pintura Roja', images: ['/img/paint-fallback.webp'] },
        variant: { axisValues: { Color: 'Rojo|#ff0000|/img/axis-red.webp' } },
      },
    ]);

    const res = await service.getStoreCommissionOrders(
      'store-1',
      { limit: 99, offset: -5 },
      { id: 'owner-1', role: UserRole.COMPANY },
    );

    expect(mockOrderRepo.findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 50,
        skip: 0,
      }),
    );
    expect(mockOrderItemRepo.createQueryBuilder).toHaveBeenCalledTimes(1);
    expect(res.total).toBe(45);
    expect(res.limit).toBe(50);
    expect(res.offset).toBe(0);
    expect(res.hasMore).toBe(true);
    expect(res.items[0]).toMatchObject({
      id: 'ord-1',
      itemImageUrl: '/img/var-1.webp',
      firstItemTitle: 'Producto Sin Foto',
      itemsCount: 2,
    });
    expect(res.items[0].items).toHaveLength(2);
    expect(res.items[0].items[0]).toMatchObject({
      id: 'oi-1',
      title: 'Producto Sin Foto',
      quantity: 1,
    });
    expect(res.items[0].items[1]).toMatchObject({
      id: 'oi-2',
      title: 'Taladro 20V',
      quantity: 1,
      imageUrl: '/img/var-1.webp',
    });
    expect(res.items[1]).toMatchObject({
      id: 'ord-2',
      itemImageUrl: '/img/axis-red.webp',
      firstItemTitle: 'Pintura Roja',
      itemsCount: 1,
    });
    expect(res.summaryCounts).toBeDefined();
  });

  it('correctly maps commissionStatus, settlement metadata, and summary counts across filters', async () => {
    mockStoreRepo.findOne.mockResolvedValue({
      id: 'store-1',
      name: 'Tienda Central',
      owner: { id: 'owner-1' },
      isCommissionExempt: false,
    });

    mockBillingRepo.find.mockResolvedValue([
      {
        id: 'bill-paid-1',
        status: BillingStatus.PAID,
        associatedOrderIds: ['ord-collected'],
        createdAt: new Date('2026-11-01T00:00:00Z'),
      },
    ]);

    const sampleOrders = [
      {
        id: 'ord-pending',
        totalAmount: 100,
        finalAmount: 100,
        platformCommissionRate: 5,
        platformCommissionAmount: 5,
        status: 'FULLY_PAID',
        createdAt: new Date('2026-11-12T10:00:00Z'),
      },
      {
        id: 'ord-collected',
        totalAmount: 50,
        finalAmount: 50,
        platformCommissionRate: 5,
        platformCommissionAmount: 2.5,
        status: 'FULLY_PAID',
        createdAt: new Date('2026-10-28T10:00:00Z'),
      },
      {
        id: 'ord-exempt',
        totalAmount: 30,
        finalAmount: 30,
        platformCommissionRate: 0,
        platformCommissionAmount: 0,
        status: 'FULLY_PAID',
        createdAt: new Date('2026-11-05T10:00:00Z'),
      },
    ];

    mockOrderRepo.findAndCount.mockResolvedValue([sampleOrders, 3]);
    mockOrderRepo.count
      .mockResolvedValueOnce(3) // allCount
      .mockResolvedValueOnce(1) // exemptCount
      .mockResolvedValueOnce(1); // collectedCount

    mockOrderItemQb.getMany.mockResolvedValue([
      {
        id: 'oi-pending-1',
        title: 'Vestido Lola',
        quantity: 2,
        price: 50,
        variantLabel: 'Rojo / M',
        order: { id: 'ord-pending' },
        item: { title: 'Vestido Lola', mainImage: '/img/vestido.webp' },
        variant: null,
      },
      {
        id: 'oi-collected-1',
        title: 'Torta Marmoleada',
        quantity: 1,
        price: 50,
        order: { id: 'ord-collected' },
        item: { title: 'Torta Marmoleada', mainImage: '/img/torta.webp' },
        variant: null,
      },
    ]);

    const res = await service.getStoreCommissionOrders(
      'store-1',
      { filter: 'all' },
      { id: 'owner-1', role: UserRole.COMPANY },
    );

    expect(res.summaryCounts).toEqual({
      all: 3,
      pending: 1,
      collected: 1,
      exempt: 1,
    });

    const pendingItem = res.items.find((i) => i.id === 'ord-pending');
    expect(pendingItem?.commissionStatus).toBe('PENDING');
    expect(pendingItem?.items).toHaveLength(1);
    expect(pendingItem?.items[0]).toMatchObject({
      title: 'Vestido Lola',
      quantity: 2,
      variantLabel: 'Rojo / M',
    });

    const collectedItem = res.items.find((i) => i.id === 'ord-collected');
    expect(collectedItem?.commissionStatus).toBe('COLLECTED');
    expect(collectedItem?.settlementBillingId).toBe('bill-paid-1');

    const exemptItem = res.items.find((i) => i.id === 'ord-exempt');
    expect(exemptItem?.commissionStatus).toBe('EXEMPT');

    // Test filter query: filter = 'pending'
    await service.getStoreCommissionOrders(
      'store-1',
      { filter: 'pending' },
      { id: 'owner-1', role: UserRole.COMPANY },
    );
    expect(mockOrderRepo.findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          platformCommissionAmount: expect.anything(),
        }),
      }),
    );
  });

  it('rejects unauthorized users and restricted collaborators in getStoreCommissionOrders', async () => {
    mockStoreRepo.findOne.mockResolvedValue({
      id: 'store-1',
      name: 'Tienda Norte',
      owner: { id: 'owner-1' },
      company: { id: 'comp-1', owner: { id: 'owner-1' } },
    });

    await expect(
      service.getStoreCommissionOrders(
        'store-1',
        { limit: 20, offset: 0 },
        { id: 'intruder', role: UserRole.COMPANY, company: { id: 'comp-2' } },
      ),
    ).rejects.toThrow(ForbiddenException);

    await expect(
      service.getStoreCommissionOrders(
        'store-1',
        { limit: 20, offset: 0 },
        {
          id: 'collab-1',
          isCollaborator: true,
          company: { id: 'comp-1' },
          hasFullBranchAccess: false,
          allowedBranchIds: ['store-2'],
        },
      ),
    ).rejects.toThrow(ForbiddenException);

    await expect(
      service.getStoreCommissionOrders(
        'store-1',
        { limit: 20, offset: 0 },
        {
          id: 'collab-2',
          isCollaborator: true,
          company: { id: 'comp-1' },
          hasFullBranchAccess: false,
          allowedBranchIds: ['store-1'],
        },
      ),
    ).resolves.toMatchObject({ total: 0, hasMore: false, items: [] });
  });
});
