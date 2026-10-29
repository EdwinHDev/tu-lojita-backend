import { OrderDisputeService } from './order-dispute.service';
import {
  DisputePenaltyType,
  DisputeResolution,
  DisputeStatus,
  DisputeVerdict,
} from './types';
import { UserRole } from '../user/types';
import { StoreStatus } from '../store/types/status.enum';

describe('OrderDisputeService - resolve with penalties and verdict', () => {
  let service: OrderDisputeService;
  let mockDisputeRepo: any;
  let mockOrderRepo: any;
  let mockUserRepo: any;
  let mockStoreRepo: any;
  let mockStoreStrikeRepo: any;
  let mockNotificationService: any;
  let mockMailService: any;
  let mockRankingService: any;

  const adminUser = {
    id: 'admin-uuid',
    role: UserRole.ADMIN,
  } as any;

  const mockOrder = {
    id: 'order-12345678-uuid',
    user: { id: 'buyer-uuid', email: 'buyer@test.com', firstName: 'Juan' },
    store: {
      id: 'store-uuid',
      name: 'Tienda Test',
      strikes: 0,
      status: StoreStatus.ACTIVE,
      owner: { id: 'owner-uuid', email: 'owner@test.com', firstName: 'Pedro' },
    },
  };

  beforeEach(() => {
    mockDisputeRepo = {
      findOne: jest.fn(),
      save: jest.fn().mockImplementation((d) => Promise.resolve(d)),
    };
    mockOrderRepo = {
      findOne: jest.fn(),
      save: jest.fn().mockImplementation((o) => Promise.resolve(o)),
    };
    mockUserRepo = {
      findOne: jest.fn(),
      save: jest.fn().mockImplementation((u) => Promise.resolve(u)),
    };
    mockStoreRepo = {
      findOne: jest.fn(),
      save: jest.fn().mockImplementation((s) => Promise.resolve(s)),
    };
    mockStoreStrikeRepo = {
      create: jest
        .fn()
        .mockImplementation((data) => ({ id: 'strike-uuid', ...data })),
      save: jest.fn().mockResolvedValue({ id: 'strike-uuid' }),
      count: jest.fn().mockResolvedValue(1),
    };
    mockNotificationService = {
      create: jest.fn().mockResolvedValue({}),
      notifyAdminBadgesChanged: jest.fn().mockResolvedValue(undefined),
      notifyDisputeUpdated: jest.fn(),
    };
    mockMailService = {
      sendDisputeVerdictNotice: jest.fn().mockResolvedValue(undefined),
    };
    mockRankingService = {
      processEvent: jest.fn().mockResolvedValue(undefined),
    };

    service = new OrderDisputeService(
      mockDisputeRepo,
      mockOrderRepo,
      mockNotificationService,
      mockMailService,
      mockRankingService,
      mockUserRepo,
      mockStoreRepo,
      mockStoreStrikeRepo,
    );
  });

  it('should resolve dispute with BUYER_FAVOR and apply STRIKE to merchant', async () => {
    const dispute = {
      id: 'dispute-1',
      orderId: mockOrder.id,
      order: mockOrder,
      status: DisputeStatus.ADMIN_REVIEW,
    };
    mockDisputeRepo.findOne.mockResolvedValue(dispute);
    mockStoreRepo.findOne.mockResolvedValue({ ...mockOrder.store });

    const res = await service.resolve(
      'dispute-1',
      {
        verdict: DisputeVerdict.BUYER_FAVOR,
        merchantPenalty: DisputePenaltyType.STRIKE,
        buyerPenalty: DisputePenaltyType.NONE,
        adminNote:
          'El comprobante bancario del cliente es verídico. Se requiere reembolso.',
      },
      adminUser,
    );

    expect(res.dispute.verdict).toBe(DisputeVerdict.BUYER_FAVOR);
    expect(res.dispute.status).toBe(DisputeStatus.REFUNDED);
    expect(res.dispute.merchantPenalty).toBe(DisputePenaltyType.STRIKE);
    expect(mockStoreStrikeRepo.save).toHaveBeenCalled();
    expect(mockStoreRepo.save).toHaveBeenCalled();
    expect(mockMailService.sendDisputeVerdictNotice).toHaveBeenCalledTimes(2);
    expect(mockRankingService.processEvent).toHaveBeenCalledWith(
      mockOrder.store.id,
      'DISPUTE_LOST',
      'dispute-1',
    );
  });

  it('should resolve dispute with MERCHANT_FAVOR and apply SUSPEND_15_DAYS to buyer', async () => {
    const dispute = {
      id: 'dispute-2',
      orderId: mockOrder.id,
      order: mockOrder,
      status: DisputeStatus.ADMIN_REVIEW,
    };
    mockDisputeRepo.findOne.mockResolvedValue(dispute);
    const mockBuyer = { id: 'buyer-uuid', email: 'buyer@test.com' };
    mockUserRepo.findOne.mockResolvedValue(mockBuyer);

    const res = await service.resolve(
      'dispute-2',
      {
        verdict: DisputeVerdict.MERCHANT_FAVOR,
        buyerPenalty: DisputePenaltyType.SUSPEND_15_DAYS,
        merchantPenalty: DisputePenaltyType.NONE,
        adminNote: 'Comprobante manipulado detectado. Se sanciona al usuario.',
      },
      adminUser,
    );

    expect(res.dispute.verdict).toBe(DisputeVerdict.MERCHANT_FAVOR);
    expect(res.dispute.status).toBe(DisputeStatus.RESOLVED);
    expect(res.dispute.buyerPenalty).toBe(DisputePenaltyType.SUSPEND_15_DAYS);
    expect(mockBuyer).toHaveProperty('accountSuspendedUntil');
    expect(mockUserRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        accountSuspensionReason: expect.stringContaining(
          'Suspensión de 15 días',
        ),
      }),
    );
    expect(mockMailService.sendDisputeVerdictNotice).toHaveBeenCalledTimes(2);
  });
});
