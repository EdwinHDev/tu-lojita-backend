import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { OrderService } from '../order/order.service';
import { OrderDisputeService } from './order-dispute.service';
import { NotificationGateway } from '../notification/notification.gateway';
import { NotificationType } from '../notification/entities/notification.entity';
import { DisputeStatus, DisputeType } from './types/dispute.enum';
import { OrderStatus } from '../order/types';
import { PaymentStatus } from '../payment/types/payment-status.enum';
import { UserRole } from '../user/types';

describe('End-to-End Local Verification: Payment Rejection -> Dispute Escalation Flow', () => {
  let orderService: OrderService;
  let orderDisputeService: OrderDisputeService;
  let notificationGateway: NotificationGateway;

  // State stores for mock integration
  let mockOrder: any;
  let mockDispute: any = null;
  const mockNotifications: any[] = [];
  const emittedSocketEvents: Array<{
    event: string;
    room?: string;
    data: any;
  }> = [];

  const buyerUser = { id: 'buyer-uuid-1', role: UserRole.USER };
  const merchantUser = { id: 'merchant-uuid-1', role: UserRole.VENDOR };
  const strangerUser = { id: 'stranger-uuid-1', role: UserRole.USER };

  beforeEach(() => {
    mockDispute = null;
    mockNotifications.length = 0;
    emittedSocketEvents.length = 0;

    // Step 1 initial setup: Order is CANCELLED with payment REJECTED
    mockOrder = {
      id: 'order-test-e2e',
      status: OrderStatus.CANCELLED,
      user: buyerUser,
      store: {
        id: 'store-uuid-1',
        owner: merchantUser,
      },
      payments: [
        {
          id: 'pay-rejected-1',
          status: PaymentStatus.REJECTED,
          amount: 25.5,
          reference: 'TRANSF-987654',
        },
      ],
      items: [],
    };

    const mockOrderRepo: any = {
      findOne: jest.fn().mockImplementation(() => Promise.resolve(mockOrder)),
      save: jest.fn().mockImplementation((order) => Promise.resolve(order)),
    };

    const mockDisputeRepo: any = {
      findOne: jest.fn().mockImplementation(() => Promise.resolve(mockDispute)),
      create: jest.fn().mockImplementation((dto) => {
        mockDispute = {
          id: 'dispute-test-e2e',
          ...dto,
          order: mockOrder,
        };
        return mockDispute;
      }),
      save: jest.fn().mockImplementation((disp) => {
        mockDispute = { ...mockDispute, ...disp };
        return Promise.resolve(mockDispute);
      }),
    };

    const mockNotifService: any = {
      create: jest.fn().mockImplementation((notifDto) => {
        mockNotifications.push(notifDto);
        return Promise.resolve(notifDto);
      }),
      notifyAdminActionRequired: jest.fn().mockImplementation((action) => {
        emittedSocketEvents.push({
          event: 'admin_action_required',
          data: action,
        });
        return Promise.resolve();
      }),
      notifyAdminBadgesChanged: jest.fn().mockResolvedValue(undefined),
      notifyDisputeUpdated: jest
        .fn()
        .mockImplementation((dispute, extraData) => {
          emittedSocketEvents.push({
            event: 'dispute_updated',
            room: `order_chat_${dispute.orderId || dispute.order?.id}`,
            data: {
              disputeId: dispute.id,
              status: dispute.status,
              resolution: dispute.resolution,
              ...extraData,
            },
          });
        }),
      checkChatStatusForOrder: jest
        .fn()
        .mockImplementation((orderId, userId) => {
          const isParticipant =
            userId === mockOrder.user.id || userId === mockOrder.store.owner.id;
          return Promise.resolve({
            allowed: isParticipant,
            reason: isParticipant ? undefined : 'FORBIDDEN',
          });
        }),
      getChatHistory: jest.fn().mockResolvedValue([]),
      markMessagesDelivered: jest.fn().mockResolvedValue(undefined),
    };

    const mockMailService: any = {
      sendDisputeOpenedToStore: jest.fn().mockResolvedValue(undefined),
      sendDisputeEscalatedToAdmin: jest.fn().mockResolvedValue(undefined),
    };

    const mockRankingService: any = {
      processEvent: jest.fn().mockResolvedValue(undefined),
    };

    orderService = new (OrderService as any)(
      mockOrderRepo,
      {} /* storeRepo */,
      {} /* itemRepo */,
      {} /* itemVariantRepo */,
      {} /* userRepo */,
      {} /* orderReviewRepo */,
      {} /* buyerReviewRepo */,
      mockDisputeRepo,
      {} /* dataSource */,
      mockNotifService,
      mockMailService,
      {} /* commissionService */,
      mockRankingService,
    );

    orderDisputeService = new (OrderDisputeService as any)(
      mockDisputeRepo,
      mockOrderRepo,
      mockNotifService,
      mockMailService,
      mockRankingService,
    );

    const mockJwtService: any = {
      verifyAsync: jest.fn().mockImplementation((token) => {
        if (token === 'token-stranger')
          return Promise.resolve({ sub: strangerUser.id });
        if (token === 'token-buyer')
          return Promise.resolve({ sub: buyerUser.id });
        if (token === 'token-merchant')
          return Promise.resolve({ sub: merchantUser.id });
        throw new Error('Invalid token');
      }),
    };

    notificationGateway = new NotificationGateway(
      mockJwtService,
      mockNotifService,
    );
  });

  it('verifies the complete lifecycle sequentially', async () => {
    // -------------------------------------------------------------
    // STEP 1: Verify order is cancelled with rejected payment
    // -------------------------------------------------------------
    expect(mockOrder.status).toBe(OrderStatus.CANCELLED);
    expect(mockOrder.payments[0].status).toBe(PaymentStatus.REJECTED);

    // -------------------------------------------------------------
    // STEP 2: Buyer creates dispute with bank proof
    // -------------------------------------------------------------
    const createdDispute = await orderDisputeService.create(
      {
        orderId: mockOrder.id,
        type: DisputeType.REFUND_REQUEST,
        reason: 'El dinero fue debitado de mi cuenta según comprobante anexo.',
        evidenceUrls: ['https://storage.tulojita.com/evidence-receipt.jpg'],
      },
      buyerUser as any,
    );

    // 2.1 State MUST transition directly to ADMIN_REVIEW (skipping OPEN / merchant response wait)
    expect(createdDispute.status).toBe(DisputeStatus.ADMIN_REVIEW);
    expect(createdDispute.evidenceUrls).toContain(
      'https://storage.tulojita.com/evidence-receipt.jpg',
    );

    // 2.2 Store MUST receive DISPUTE_ESCALATED notification informing them of admin mediation
    const storeNotification = mockNotifications.find(
      (n) =>
        n.userId === merchantUser.id &&
        n.type === NotificationType.DISPUTE_ESCALATED,
    );
    expect(storeNotification).toBeDefined();
    expect(storeNotification.title).toContain('mediación');
    expect(storeNotification.body).toContain('revisión');

    // 2.3 Realtime socket event dispute_updated must be dispatched
    const socketDisputeEvent = emittedSocketEvents.find(
      (e) => e.event === 'dispute_updated',
    );
    expect(socketDisputeEvent).toBeDefined();
    expect(socketDisputeEvent?.data.status).toBe(DisputeStatus.ADMIN_REVIEW);

    // -------------------------------------------------------------
    // STEP 3: Attempt to close / acceptPaymentNotReceived
    // MUST FAIL with 400 Bad Request while active dispute exists
    // -------------------------------------------------------------
    await expect(
      orderService.acceptPaymentNotReceived(mockOrder.id, buyerUser.id),
    ).rejects.toThrow(BadRequestException);

    // -------------------------------------------------------------
    // STEP 4: Unauthorized stranger attempts to fetch dispute
    // MUST FAIL with 403 Forbidden
    // -------------------------------------------------------------
    await expect(
      orderDisputeService.findOne(createdDispute.id, strangerUser as any),
    ).rejects.toThrow(ForbiddenException);

    // Buyer and Merchant CAN fetch it
    await expect(
      orderDisputeService.findOne(createdDispute.id, buyerUser as any),
    ).resolves.toBeDefined();
    await expect(
      orderDisputeService.findOne(createdDispute.id, merchantUser as any),
    ).resolves.toBeDefined();

    // -------------------------------------------------------------
    // STEP 5: Unauthorized stranger attempts to join order chat room
    // MUST be denied and prevented from joining
    // -------------------------------------------------------------
    const mockStrangerClient: any = {
      id: 'socket-client-stranger',
      handshake: {
        auth: { token: 'token-stranger' },
      },
      emit: jest.fn(),
      join: jest.fn(),
    };

    await notificationGateway.handleJoinChat(mockStrangerClient, {
      orderId: mockOrder.id,
    });

    expect(mockStrangerClient.emit).toHaveBeenCalledWith(
      'chat_access_denied',
      expect.objectContaining({
        orderId: mockOrder.id,
        message: expect.stringContaining('No tienes autorización'),
      }),
    );
    expect(mockStrangerClient.join).not.toHaveBeenCalled();

    // Authorized buyer CAN join chat room
    const mockBuyerClient: any = {
      id: 'socket-client-buyer',
      handshake: {
        auth: { token: 'token-buyer' },
      },
      emit: jest.fn(),
      join: jest.fn(),
    };

    await notificationGateway.handleJoinChat(mockBuyerClient, {
      orderId: mockOrder.id,
    });

    expect(mockBuyerClient.join).toHaveBeenCalledWith(
      `order_chat_${mockOrder.id}`,
    );
    expect(mockBuyerClient.emit).toHaveBeenCalledWith('chat_history', []);
  });
});
