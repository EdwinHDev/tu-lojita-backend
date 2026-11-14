jest.mock('@nestjs/common/utils/load-package.util', () => ({
  loadPackage: (pkg: string) => require(pkg),
}));
jest.mock('@nestjs/typeorm', () => ({
  InjectRepository: () => () => {},
}));

import {
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { CompanyCrmService } from './services/company-crm.service';
import { CompanyPermission } from './types/company-permission.enum';
import { CrmOfferStatus } from './entities/crm-targeted-offer.entity';
import { OrderStatus } from 'src/order/types';
import { NotificationType } from 'src/notification/entities/notification.entity';

describe('CompanyCrmService', () => {
  let service: CompanyCrmService;
  let companyRepo: any;
  let storeRepo: any;
  let userRepo: any;
  let addressRepo: any;
  let orderRepo: any;
  let installmentRepo: any;
  let paymentRepo: any;
  let bookingRepo: any;
  let itemRepo: any;
  let favoriteRepo: any;
  let disputeRepo: any;
  let buyerReviewRepo: any;
  let orderReviewRepo: any;
  let blockRepo: any;
  let platformPaymentMethodRepo: any;
  let profileRepo: any;
  let noteRepo: any;
  let offerRepo: any;
  let notificationService: any;
  let platformSettingsService: any;
  let activityLogService: any;

  const makeQb = (rows: any[] = []) => ({
    innerJoinAndSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue({ affected: 0 }),
    getMany: jest.fn().mockResolvedValue(rows),
  });

  beforeEach(() => {
    companyRepo = { findOne: jest.fn() };
    storeRepo = { find: jest.fn().mockResolvedValue([]) };
    userRepo = { find: jest.fn().mockResolvedValue([]), findOne: jest.fn() };
    addressRepo = { find: jest.fn().mockResolvedValue([]) };
    orderRepo = { find: jest.fn().mockResolvedValue([]) };
    installmentRepo = { find: jest.fn().mockResolvedValue([]) };
    paymentRepo = { find: jest.fn().mockResolvedValue([]) };
    bookingRepo = { find: jest.fn().mockResolvedValue([]) };
    itemRepo = { findOne: jest.fn() };
    favoriteRepo = {
      findOne: jest.fn(),
      createQueryBuilder: jest.fn(() => makeQb([])),
    };
    disputeRepo = { find: jest.fn().mockResolvedValue([]) };
    buyerReviewRepo = { find: jest.fn().mockResolvedValue([]) };
    orderReviewRepo = { find: jest.fn().mockResolvedValue([]) };
    blockRepo = { find: jest.fn().mockResolvedValue([]) };
    platformPaymentMethodRepo = { find: jest.fn().mockResolvedValue([]) };
    profileRepo = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
      create: jest.fn((x) => x),
      save: jest.fn(async (x) => ({ id: 'prof-1', ...x })),
    };
    noteRepo = {
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn((x) => x),
      save: jest.fn(async (x) => ({ id: 'note-1', ...x })),
    };
    offerRepo = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
      create: jest.fn((x) => x),
      save: jest.fn(async (x) => ({ id: 'offer-1', ...x })),
      createQueryBuilder: jest.fn(() => makeQb([])),
    };
    notificationService = { create: jest.fn().mockResolvedValue({}) };
    platformSettingsService = {
      getExchangeRateConfig: jest.fn().mockResolvedValue({
        enabled: true,
        rate: 50,
        currency: 'VES',
        symbol: 'Bs.',
      }),
      getCrmOfferConfig: jest.fn().mockResolvedValue({
        enabled: true,
        feePerCampaign: 1.0,
      }),
    };
    activityLogService = { log: jest.fn().mockResolvedValue(undefined) };

    service = new CompanyCrmService(
      companyRepo,
      storeRepo,
      userRepo,
      addressRepo,
      orderRepo,
      installmentRepo,
      paymentRepo,
      bookingRepo,
      itemRepo,
      favoriteRepo,
      disputeRepo,
      buyerReviewRepo,
      orderReviewRepo,
      blockRepo,
      platformPaymentMethodRepo,
      profileRepo,
      noteRepo,
      offerRepo,
      notificationService,
      platformSettingsService,
      activityLogService,
    );
  });

  describe('RBAC & Access Control', () => {
    it('denies collaborator without crm permissions', async () => {
      await expect(
        service.validateCrmAccess(
          {
            id: 'col-1',
            isCollaborator: true,
            company: { id: 'comp-1' },
            permissions: [CompanyPermission.ORDERS_VIEW],
          },
          'comp-1',
          false,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows collaborator with crm:access to read but denies manage mutations', async () => {
      const readCtx = await service.validateCrmAccess(
        {
          id: 'col-1',
          firstName: 'Ana',
          isCollaborator: true,
          company: { id: 'comp-1' },
          permissions: [CompanyPermission.CRM_ACCESS],
          hasFullBranchAccess: false,
          allowedBranchIds: ['store-1'],
        },
        'comp-1',
        false,
      );
      expect(readCtx.allowedStoreIds).toEqual(['store-1']);

      await expect(
        service.validateCrmAccess(
          {
            id: 'col-1',
            isCollaborator: true,
            company: { id: 'comp-1' },
            permissions: [CompanyPermission.CRM_ACCESS],
          },
          'comp-1',
          true,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows company owner full CRM read & manage', async () => {
      companyRepo.findOne.mockResolvedValue({ id: 'comp-1' });
      const ctx = await service.validateCrmAccess(
        { id: 'owner-1', firstName: 'Edwin', role: 'COMPANY' },
        'comp-1',
        true,
      );
      expect(ctx.isOwner).toBe(true);
      expect(ctx.allowedStoreIds).toBeUndefined();
    });
  });

  describe('Consolidated Summary & RFM Segmentation', () => {
    it('consolidates buyers across branches and segments VIP + WISHLIST customers', async () => {
      companyRepo.findOne.mockResolvedValue({
        id: 'comp-1',
        owner: { id: 'owner-1' },
        stores: [
          { id: 'store-1', name: 'Tienda', branchName: 'Centro', isDeleted: false },
          { id: 'store-2', name: 'Tienda', branchName: 'Norte', isDeleted: false },
        ],
      });

      const now = new Date();
      orderRepo.find.mockResolvedValue([
        {
          id: 'ord-1',
          user: { id: 'cust-vip' },
          store: { id: 'store-1', name: 'Tienda', branchName: 'Centro' },
          status: OrderStatus.FULLY_PAID,
          finalAmount: 180,
          totalAmount: 180,
          isFullyPaid: true,
          remainingBalance: 0,
          createdAt: now,
          installments: [],
          disputes: [],
        },
        {
          id: 'ord-2',
          user: { id: 'cust-vip' },
          store: { id: 'store-2', name: 'Tienda', branchName: 'Norte' },
          status: OrderStatus.PARTIALLY_PAID,
          finalAmount: 120,
          totalAmount: 120,
          isFullyPaid: false,
          remainingBalance: 60,
          nextDueDate: now,
          createdAt: now,
          installments: [],
          disputes: [],
        },
      ]);

      favoriteRepo.createQueryBuilder.mockReturnValue(
        makeQb([
          {
            id: 'fav-1',
            userId: 'cust-wish',
            createdAt: now,
            item: {
              id: 'item-1',
              title: 'Zapatos Pro',
              price: 80,
              mainImage: 'https://img/a.png',
              store: { id: 'store-1', name: 'Tienda', branchName: 'Centro' },
            },
          },
        ]),
      );

      userRepo.find.mockResolvedValue([
        {
          id: 'cust-vip',
          firstName: 'Carlos',
          lastName: 'Pérez',
          phone: '+584121234567',
          email: 'carlos@test.com',
          identification: 'V12345678',
          averageBuyerRating: 4.9,
          totalBuyerReviews: 5,
        },
        {
          id: 'cust-wish',
          firstName: 'María',
          lastName: 'López',
          phone: '+584141112233',
          email: 'maria@test.com',
          identification: 'V87654321',
          averageBuyerRating: 5.0,
          totalBuyerReviews: 1,
        },
      ]);

      const summary = await service.getSummary('comp-1', {
        id: 'owner-1',
        firstName: 'Owner',
        role: 'COMPANY',
      });

      expect(summary.totalCustomers).toBe(2);
      expect(summary.vipCount).toBe(1);
      expect(summary.wishlistOnlyCount).toBe(1);
      expect(summary.withDebtCount).toBe(1);
      expect(summary.totalLtvUsd).toBe(300);
      expect(summary.totalPendingDebtUsd).toBe(60);

      const listRes = await service.listCustomers(
        'comp-1',
        { id: 'owner-1', firstName: 'Owner', role: 'COMPANY' },
        {},
      );
      const vip = listRes.customers.find((c) => c.customerId === 'cust-vip');
      expect(vip?.affiliatedStores).toHaveLength(2);
      expect(vip?.segment).toBe('VIP');
    });
  });

  describe('Targeted Favorite Offers', () => {
    const ownerActor = {
      id: 'owner-1',
      firstName: 'Owner',
      role: 'COMPANY',
    };

    beforeEach(() => {
      companyRepo.findOne.mockResolvedValue({
        id: 'comp-1',
        stores: [{ id: 'store-1', name: 'Tienda', branchName: 'Centro', isDeleted: false }],
      });
      userRepo.findOne.mockResolvedValue({
        id: 'cust-1',
        firstName: 'Lucía',
        lastName: 'Gómez',
      });
      itemRepo.findOne.mockResolvedValue({
        id: 'item-1',
        title: 'Audífonos BT',
        price: 100,
        mainImage: 'https://img/item.png',
        isActive: true,
        isDeleted: false,
        store: { id: 'store-1', name: 'Tienda', branchName: 'Centro' },
      });
    });

    it('rejects offer when service is disabled by admin', async () => {
      platformSettingsService.getCrmOfferConfig.mockResolvedValue({
        enabled: false,
        feePerCampaign: 1,
      });

      await expect(
        service.createTargetedOffer(
          'comp-1',
          'cust-1',
          {
            itemId: 'item-1',
            offerPrice: 75,
            durationHours: 24,
            paymentMethod: 'Pago Móvil',
            paymentReference: '998877',
          },
          ownerActor,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects offer when item is not in customer favorites', async () => {
      favoriteRepo.findOne.mockResolvedValue(null);

      await expect(
        service.createTargetedOffer(
          'comp-1',
          'cust-1',
          {
            itemId: 'item-1',
            offerPrice: 75,
            durationHours: 24,
            paymentMethod: 'Pago Móvil',
            paymentReference: '998877',
          },
          ownerActor,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects offer without payment reference when feePerCampaign > 0', async () => {
      favoriteRepo.findOne.mockResolvedValue({ id: 'fav-1' });

      await expect(
        service.createTargetedOffer(
          'comp-1',
          'cust-1',
          {
            itemId: 'item-1',
            offerPrice: 75,
            durationHours: 24,
          },
          ownerActor,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('creates targeted offer and dispatches CRM_OFFER push notification when valid', async () => {
      favoriteRepo.findOne.mockResolvedValue({ id: 'fav-1' });

      const result = await service.createTargetedOffer(
        'comp-1',
        'cust-1',
        {
          itemId: 'item-1',
          offerPrice: 75,
          durationHours: 24,
          paymentMethod: 'Pago Móvil',
          paymentReference: '123456',
          messageToCustomer: 'Solo hoy para ti',
        },
        ownerActor,
      );

      expect(result.offerCode).toMatch(/^OFR-[A-F0-9]{8}$/);
      expect(result.discountPercent).toBe(25);
      expect(result.serviceFeeUsd).toBe(1);
      expect(result.whatsappShareText).toContain('https://api.tulojita.com/api/v1/crm-offers/redirect/');
      expect(notificationService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'cust-1',
          type: NotificationType.CRM_OFFER,
          channelType: 'CRM_OFFER',
          itemId: 'item-1',
          offerCode: result.offerCode,
          body: expect.stringContaining(result.offerCode),
        }),
      );
    });
  });

  describe('Public Offer Resolution & Expiry', () => {
    it('auto-expires outdated active offers and returns zero PII', async () => {
      const pastDate = new Date(Date.now() - 60_000);
      offerRepo.findOne.mockResolvedValue({
        id: 'offer-1',
        offerCode: 'OFR-ABCD1234',
        customerId: 'cust-secret-id',
        originalPrice: 100,
        offerPrice: 80,
        discountPercent: 20,
        durationHours: 24,
        expiresAt: pastDate,
        status: CrmOfferStatus.ACTIVE,
        deepLinkUrl: 'https://api.tulojita.com/api/v1/crm-offers/redirect/OFR-ABCD1234',
        item: {
          id: 'item-1',
          title: 'Producto Demo',
          description: 'Desc',
          price: 100,
          priceType: 'FIXED',
          mainImage: 'img.png',
          images: [],
          isActive: true,
          isDeleted: false,
        },
        store: {
          id: 'store-1',
          name: 'Tienda',
          logo: 'logo.png',
          slug: 'tienda',
        },
      });

      const resolved = await service.resolveOfferByCode('OFR-ABCD1234');
      expect(resolved.expired).toBe(true);
      expect(resolved.valid).toBe(false);
      expect(resolved.status).toBe(CrmOfferStatus.EXPIRED);
      expect((resolved as any).customerId).toBeUndefined();
    });
  });
});
