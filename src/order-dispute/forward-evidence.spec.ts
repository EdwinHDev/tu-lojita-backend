import { BadRequestException, NotFoundException } from '@nestjs/common';
import { OrderDisputeService } from './order-dispute.service';
import { ChatChannelType } from '../notification/entities/chat-message.entity';
import { User } from '../user/entities/user.entity';
import { UserRole } from '../user/types';

describe('OrderDisputeService - forwardEvidence', () => {
  let service: OrderDisputeService;
  let mockDisputeRepo: any;
  let mockOrderRepo: any;
  let mockNotificationService: any;
  let mockMailService: any;
  let mockRankingService: any;

  const adminUser: User = {
    id: 'admin-uuid',
    role: UserRole.ADMIN,
    email: 'admin@tulojita.com',
  } as any;

  const mockDispute = {
    id: 'dispute-1',
    orderId: 'order-1',
    order: {
      id: 'order-1',
      user: { id: 'buyer-1' },
      store: { id: 'store-1', owner: { id: 'merchant-1' } },
    },
  };

  beforeEach(() => {
    mockDisputeRepo = {
      findOne: jest.fn(),
      save: jest.fn(),
    };
    mockOrderRepo = {
      findOne: jest.fn(),
      save: jest.fn(),
    };
    mockNotificationService = {
      getChatMessageById: jest.fn(),
      saveMessage: jest.fn(),
      notifyAdminBadgesChanged: jest.fn().mockResolvedValue(undefined),
      notifyDisputeUpdated: jest.fn(),
    };
    mockMailService = {
      sendDisputeOpenedEmail: jest.fn(),
      sendDisputeResolvedEmail: jest.fn(),
    };
    mockRankingService = {
      processEvent: jest.fn(),
    };

    service = new OrderDisputeService(
      mockDisputeRepo,
      mockOrderRepo,
      mockNotificationService,
      mockMailService,
      mockRankingService,
    );
  });

  it('should forward evidence from buyer support to merchant support successfully', async () => {
    mockDisputeRepo.findOne.mockResolvedValue(mockDispute);
    mockNotificationService.getChatMessageById.mockResolvedValue({
      id: 'msg-buyer-1',
      order: { id: 'order-1' },
      imageUrl: 'https://images.tulojita.com/evidence/buyer-proof.jpg',
      channelType: ChatChannelType.DISPUTE_BUYER_SUPPORT,
    });
    mockNotificationService.saveMessage.mockResolvedValue({
      id: 'msg-forwarded-1',
      content:
        '📷 [EVIDENCIA TRASLADADA]: Evidencia aportada por el cliente comprador y admitida por el equipo de Soporte para revisión.',
      imageUrl: 'https://images.tulojita.com/evidence/buyer-proof.jpg',
      channelType: ChatChannelType.DISPUTE_MERCHANT_SUPPORT,
    });

    const res = await service.forwardEvidence(
      'dispute-1',
      {
        messageId: 'msg-buyer-1',
        targetChannel: ChatChannelType.DISPUTE_MERCHANT_SUPPORT,
      },
      adminUser,
    );

    expect(res.success).toBe(true);
    expect(res.message).toContain('comercio');
    expect(mockNotificationService.saveMessage).toHaveBeenCalledWith(
      'order-1',
      'admin-uuid',
      expect.stringContaining('el cliente comprador'),
      'https://images.tulojita.com/evidence/buyer-proof.jpg',
      ChatChannelType.DISPUTE_MERCHANT_SUPPORT,
    );
  });

  it('should forward evidence from merchant support to buyer support successfully', async () => {
    mockDisputeRepo.findOne.mockResolvedValue(mockDispute);
    mockNotificationService.getChatMessageById.mockResolvedValue({
      id: 'msg-merchant-1',
      order: { id: 'order-1' },
      imageUrl: 'https://images.tulojita.com/evidence/merchant-proof.jpg',
      channelType: ChatChannelType.DISPUTE_MERCHANT_SUPPORT,
    });
    mockNotificationService.saveMessage.mockResolvedValue({
      id: 'msg-forwarded-2',
      content:
        '📷 [EVIDENCIA TRASLADADA]: Evidencia aportada por el comercio vendedor y admitida por el equipo de Soporte para revisión.',
      imageUrl: 'https://images.tulojita.com/evidence/merchant-proof.jpg',
      channelType: ChatChannelType.DISPUTE_BUYER_SUPPORT,
    });

    const res = await service.forwardEvidence(
      'dispute-1',
      {
        messageId: 'msg-merchant-1',
        targetChannel: ChatChannelType.DISPUTE_BUYER_SUPPORT,
      },
      adminUser,
    );

    expect(res.success).toBe(true);
    expect(res.message).toContain('comprador');
    expect(mockNotificationService.saveMessage).toHaveBeenCalledWith(
      'order-1',
      'admin-uuid',
      expect.stringContaining('el comercio vendedor'),
      'https://images.tulojita.com/evidence/merchant-proof.jpg',
      ChatChannelType.DISPUTE_BUYER_SUPPORT,
    );
  });

  it('should reject if dispute does not exist', async () => {
    mockDisputeRepo.findOne.mockResolvedValue(null);

    await expect(
      service.forwardEvidence(
        'non-existent',
        {
          messageId: 'msg-1',
          targetChannel: ChatChannelType.DISPUTE_MERCHANT_SUPPORT,
        },
        adminUser,
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('should reject if message does not exist', async () => {
    mockDisputeRepo.findOne.mockResolvedValue(mockDispute);
    mockNotificationService.getChatMessageById.mockResolvedValue(null);

    await expect(
      service.forwardEvidence(
        'dispute-1',
        {
          messageId: 'non-existent-msg',
          targetChannel: ChatChannelType.DISPUTE_MERCHANT_SUPPORT,
        },
        adminUser,
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('should reject if message has no imageUrl', async () => {
    mockDisputeRepo.findOne.mockResolvedValue(mockDispute);
    mockNotificationService.getChatMessageById.mockResolvedValue({
      id: 'msg-text-only',
      order: { id: 'order-1' },
      imageUrl: null,
      channelType: ChatChannelType.DISPUTE_BUYER_SUPPORT,
    });

    await expect(
      service.forwardEvidence(
        'dispute-1',
        {
          messageId: 'msg-text-only',
          targetChannel: ChatChannelType.DISPUTE_MERCHANT_SUPPORT,
        },
        adminUser,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('should reject if message belongs to a different order', async () => {
    mockDisputeRepo.findOne.mockResolvedValue(mockDispute);
    mockNotificationService.getChatMessageById.mockResolvedValue({
      id: 'msg-diff-order',
      order: { id: 'other-order-999' },
      imageUrl: 'https://images.tulojita.com/photo.jpg',
      channelType: ChatChannelType.DISPUTE_BUYER_SUPPORT,
    });

    await expect(
      service.forwardEvidence(
        'dispute-1',
        {
          messageId: 'msg-diff-order',
          targetChannel: ChatChannelType.DISPUTE_MERCHANT_SUPPORT,
        },
        adminUser,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('should reject if targetChannel is the same as source channelType', async () => {
    mockDisputeRepo.findOne.mockResolvedValue(mockDispute);
    mockNotificationService.getChatMessageById.mockResolvedValue({
      id: 'msg-buyer',
      order: { id: 'order-1' },
      imageUrl: 'https://images.tulojita.com/photo.jpg',
      channelType: ChatChannelType.DISPUTE_BUYER_SUPPORT,
    });

    await expect(
      service.forwardEvidence(
        'dispute-1',
        {
          messageId: 'msg-buyer',
          targetChannel: ChatChannelType.DISPUTE_BUYER_SUPPORT,
        },
        adminUser,
      ),
    ).rejects.toThrow(BadRequestException);
  });
});
