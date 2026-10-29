import { NotificationService } from './notification.service';
import { NotificationGateway } from './notification.gateway';
import { ChatChannelType, ChatMessage } from './entities/chat-message.entity';
import { UserRole } from '../user/types';
import { OrderStatus } from '../order/types';

describe('Support Chat Channel Isolation and Security', () => {
  let notificationService: NotificationService;
  let notificationGateway: NotificationGateway;

  const mockBuyer = { id: 'buyer-uuid-1', role: UserRole.USER };
  const mockMerchant = { id: 'merchant-uuid-1', role: UserRole.VENDOR };
  const mockAdmin = { id: 'admin-uuid-1', role: UserRole.ADMIN };
  const mockStranger = { id: 'stranger-uuid-1', role: UserRole.USER };

  const mockOrder = {
    id: 'order-support-test',
    status: OrderStatus.CANCELLED,
    user: mockBuyer,
    store: {
      id: 'store-1',
      name: 'Tienda Test',
      owner: mockMerchant,
    },
    payments: [],
  };

  const storedMessages: ChatMessage[] = [];
  const emittedEvents: Array<{ event: string; room?: string; data: any }> = [];
  const userNotifications: Array<{
    userId: string;
    title: string;
    body: string;
  }> = [];

  beforeEach(() => {
    storedMessages.length = 0;
    emittedEvents.length = 0;
    userNotifications.length = 0;

    const mockOrderRepo: any = {
      findOne: jest.fn().mockResolvedValue(mockOrder),
    };

    const mockUserRepo: any = {
      findOne: jest.fn().mockImplementation(({ where: { id } }) => {
        if (id === mockBuyer.id) return Promise.resolve(mockBuyer);
        if (id === mockMerchant.id) return Promise.resolve(mockMerchant);
        if (id === mockAdmin.id) return Promise.resolve(mockAdmin);
        return Promise.resolve(mockStranger);
      }),
    };

    const mockChatRepo: any = {
      create: jest.fn().mockImplementation((data) => ({
        id: `msg-${Date.now()}-${Math.random()}`,
        createdAt: new Date(),
        isRead: false,
        isDelivered: false,
        ...data,
      })),
      save: jest.fn().mockImplementation((msg) => {
        storedMessages.push(msg);
        return Promise.resolve(msg);
      }),
      find: jest.fn().mockImplementation(({ where }) => {
        return Promise.resolve(
          storedMessages.filter(
            (m) =>
              m.order?.id === where.order?.id &&
              (where.channelType ? m.channelType === where.channelType : true),
          ),
        );
      }),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      manager: {
        findOne: jest.fn().mockImplementation((entity, { where: { id } }) => {
          if (id === mockBuyer.id) return Promise.resolve(mockBuyer);
          if (id === mockMerchant.id) return Promise.resolve(mockMerchant);
          if (id === mockAdmin.id) return Promise.resolve(mockAdmin);
          return Promise.resolve(mockStranger);
        }),
      },
    };

    const mockNotifRepo: any = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation((dto) => dto),
      save: jest.fn().mockImplementation((dto) => {
        userNotifications.push(dto);
        return Promise.resolve(dto);
      }),
    };

    const mockGateway: any = {
      sendToCustomRoom: jest.fn().mockImplementation((room, event, data) => {
        emittedEvents.push({ event, room, data });
      }),
      sendToOrderRoom: jest.fn().mockImplementation((orderId, event, data) => {
        emittedEvents.push({ event, room: `order_chat_${orderId}`, data });
      }),
      sendToUser: jest.fn().mockImplementation((userId, event, data) => {
        emittedEvents.push({ event, room: `user_${userId}`, data });
      }),
      emitAdminActionRequired: jest.fn().mockImplementation((payload) => {
        emittedEvents.push({ event: 'admin_action_required', data: payload });
        return Promise.resolve();
      }),
      emitAdminBadgesUpdate: jest.fn().mockResolvedValue(undefined),
    };

    notificationService = new (NotificationService as any)(
      mockNotifRepo,
      mockChatRepo,
      mockOrderRepo,
      {} /* userDeviceRepo */,
      mockUserRepo,
      {} /* reportRepo */,
      {} /* orderDisputeRepo */,
      {} /* storeRepo */,
      {} /* commissionPaymentReportRepo */,
      {} /* companySubscriptionRepo */,
      mockGateway,
      null /* firebaseApp */,
    );

    const mockJwtService: any = {
      verifyAsync: jest.fn().mockImplementation((token) => {
        if (token === 'token-buyer')
          return Promise.resolve({ sub: mockBuyer.id });
        if (token === 'token-merchant')
          return Promise.resolve({ sub: mockMerchant.id });
        if (token === 'token-admin')
          return Promise.resolve({ sub: mockAdmin.id });
        return Promise.resolve({ sub: mockStranger.id });
      }),
    };

    notificationGateway = new NotificationGateway(
      mockJwtService,
      notificationService,
    );
  });

  describe('Channel Access Authorization', () => {
    it('allows buyer to access DISPUTE_BUYER_SUPPORT but denies access to DISPUTE_MERCHANT_SUPPORT', async () => {
      const buyerAccess =
        await notificationService.checkSupportChatStatusForOrder(
          mockOrder.id,
          mockBuyer.id,
          ChatChannelType.DISPUTE_BUYER_SUPPORT,
        );
      expect(buyerAccess.allowed).toBe(true);

      const crossAccess =
        await notificationService.checkSupportChatStatusForOrder(
          mockOrder.id,
          mockBuyer.id,
          ChatChannelType.DISPUTE_MERCHANT_SUPPORT,
        );
      expect(crossAccess.allowed).toBe(false);
      expect(crossAccess.reason).toBe('FORBIDDEN');
    });

    it('allows merchant to access DISPUTE_MERCHANT_SUPPORT but denies access to DISPUTE_BUYER_SUPPORT', async () => {
      const merchantAccess =
        await notificationService.checkSupportChatStatusForOrder(
          mockOrder.id,
          mockMerchant.id,
          ChatChannelType.DISPUTE_MERCHANT_SUPPORT,
        );
      expect(merchantAccess.allowed).toBe(true);

      const crossAccess =
        await notificationService.checkSupportChatStatusForOrder(
          mockOrder.id,
          mockMerchant.id,
          ChatChannelType.DISPUTE_BUYER_SUPPORT,
        );
      expect(crossAccess.allowed).toBe(false);
      expect(crossAccess.reason).toBe('FORBIDDEN');
    });

    it('allows administrator to access BOTH channels', async () => {
      const adminBuyerAccess =
        await notificationService.checkSupportChatStatusForOrder(
          mockOrder.id,
          mockAdmin.id,
          ChatChannelType.DISPUTE_BUYER_SUPPORT,
        );
      expect(adminBuyerAccess.allowed).toBe(true);

      const adminMerchantAccess =
        await notificationService.checkSupportChatStatusForOrder(
          mockOrder.id,
          mockAdmin.id,
          ChatChannelType.DISPUTE_MERCHANT_SUPPORT,
        );
      expect(adminMerchantAccess.allowed).toBe(true);
    });

    it('denies external stranger on both channels', async () => {
      const strangerBuyer =
        await notificationService.checkSupportChatStatusForOrder(
          mockOrder.id,
          mockStranger.id,
          ChatChannelType.DISPUTE_BUYER_SUPPORT,
        );
      expect(strangerBuyer.allowed).toBe(false);

      const strangerMerchant =
        await notificationService.checkSupportChatStatusForOrder(
          mockOrder.id,
          mockStranger.id,
          ChatChannelType.DISPUTE_MERCHANT_SUPPORT,
        );
      expect(strangerMerchant.allowed).toBe(false);
    });
  });

  describe('Message Routing and Notification Isolation', () => {
    it('isolates buyer support message so merchant never receives notification', async () => {
      await notificationService.saveMessage(
        mockOrder.id,
        mockBuyer.id,
        'Envío comprobante bancario para que lo revise el administrador',
        'https://tulojita.com/comprobante-1.jpg',
        ChatChannelType.DISPUTE_BUYER_SUPPORT,
      );

      // Emitted ONLY to order_support_chat_order-support-test_buyer
      const buyerRoomEvents = emittedEvents.filter(
        (e) => e.room === `order_support_chat_${mockOrder.id}_buyer`,
      );
      expect(buyerRoomEvents.length).toBe(1);
      expect(buyerRoomEvents[0].event).toBe('new_support_chat_message');
      expect(buyerRoomEvents[0].data.imageUrl).toBe(
        'https://tulojita.com/comprobante-1.jpg',
      );

      // Merchant room event MUST NOT EXIST
      const merchantRoomEvents = emittedEvents.filter(
        (e) => e.room === `order_support_chat_${mockOrder.id}_merchant`,
      );
      expect(merchantRoomEvents.length).toBe(0);

      // Merchant user notification MUST NOT EXIST
      const merchantNotifs = userNotifications.filter(
        (n) => n.userId === mockMerchant.id,
      );
      expect(merchantNotifs.length).toBe(0);

      // Admin action alert MUST be emitted
      const adminAlert = emittedEvents.find(
        (e) => e.event === 'admin_action_required',
      );
      expect(adminAlert).toBeDefined();
    });

    it('isolates merchant support message so buyer never receives notification', async () => {
      await notificationService.saveMessage(
        mockOrder.id,
        mockMerchant.id,
        'No tenemos registro de esta transferencia en nuestro banco.',
        undefined,
        ChatChannelType.DISPUTE_MERCHANT_SUPPORT,
      );

      // Emitted ONLY to merchant support room
      const merchantRoomEvents = emittedEvents.filter(
        (e) => e.room === `order_support_chat_${mockOrder.id}_merchant`,
      );
      expect(merchantRoomEvents.length).toBe(1);

      // Buyer room event MUST NOT EXIST
      const buyerRoomEvents = emittedEvents.filter(
        (e) => e.room === `order_support_chat_${mockOrder.id}_buyer`,
      );
      expect(buyerRoomEvents.length).toBe(0);

      // Buyer user notification MUST NOT EXIST
      const buyerNotifs = userNotifications.filter(
        (n) => n.userId === mockBuyer.id,
      );
      expect(buyerNotifs.length).toBe(0);
    });

    it('routes admin response in buyer channel strictly to buyer', async () => {
      await notificationService.saveMessage(
        mockOrder.id,
        mockAdmin.id,
        'Estamos verificando tu comprobante con el banco.',
        undefined,
        ChatChannelType.DISPUTE_BUYER_SUPPORT,
      );

      // Buyer receives user notification
      const buyerNotif = userNotifications.find(
        (n) => n.userId === mockBuyer.id,
      );
      expect(buyerNotif).toBeDefined();

      // Merchant DOES NOT receive notification
      const merchantNotif = userNotifications.find(
        (n) => n.userId === mockMerchant.id,
      );
      expect(merchantNotif).toBeUndefined();
    });
  });

  describe('WebSocket Gateway Support Chat Event Handlers', () => {
    it('denies cross-channel join_support_chat attempt', async () => {
      const mockMerchantClient: any = {
        id: 'socket-merchant',
        handshake: { auth: { token: 'token-merchant' } },
        emit: jest.fn(),
        join: jest.fn(),
      };

      // Merchant tries to join BUYER support chat
      await notificationGateway.handleJoinSupportChat(mockMerchantClient, {
        orderId: mockOrder.id,
        channelType: ChatChannelType.DISPUTE_BUYER_SUPPORT,
      });

      expect(mockMerchantClient.emit).toHaveBeenCalledWith(
        'chat_access_denied',
        expect.objectContaining({
          orderId: mockOrder.id,
          channelType: ChatChannelType.DISPUTE_BUYER_SUPPORT,
        }),
      );
      expect(mockMerchantClient.join).not.toHaveBeenCalled();
    });

    it('allows authorized buyer to join their support chat room', async () => {
      const mockBuyerClient: any = {
        id: 'socket-buyer',
        handshake: { auth: { token: 'token-buyer' } },
        emit: jest.fn(),
        join: jest.fn(),
      };

      await notificationGateway.handleJoinSupportChat(mockBuyerClient, {
        orderId: mockOrder.id,
        channelType: ChatChannelType.DISPUTE_BUYER_SUPPORT,
      });

      expect(mockBuyerClient.join).toHaveBeenCalledWith(
        `order_support_chat_${mockOrder.id}_buyer`,
      );
      expect(mockBuyerClient.emit).toHaveBeenCalledWith(
        'support_chat_history',
        expect.objectContaining({
          channelType: ChatChannelType.DISPUTE_BUYER_SUPPORT,
        }),
      );
    });
  });
});
