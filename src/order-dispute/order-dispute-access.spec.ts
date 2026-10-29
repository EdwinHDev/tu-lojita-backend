import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { OrderService } from '../order/order.service';
import { OrderDisputeService } from './order-dispute.service';
import { NotificationService } from '../notification/notification.service';
import { NotificationGateway } from '../notification/notification.gateway';
import { NotificationType } from '../notification/entities/notification.entity';
import { UserRole } from '../user/types';
import { DisputeStatus, DisputeType } from './types/dispute.enum';
import { OrderStatus } from '../order/types';
import { PaymentStatus } from '../payment/types/payment-status.enum';

describe('Dispute and Chat Access Control Guards', () => {
  describe('OrderService.acceptPaymentNotReceived', () => {
    it('should throw BadRequestException when order has an active dispute', async () => {
      const mockOrderRepo: any = {
        findOne: jest.fn().mockResolvedValue({
          id: 'order-1',
          user: { id: 'buyer-1' },
          payments: [],
          status: OrderStatus.CANCELLED,
        }),
      };
      const mockDisputeRepo: any = {
        findOne: jest.fn().mockResolvedValue({
          id: 'dispute-1',
          orderId: 'order-1',
          status: DisputeStatus.ADMIN_REVIEW,
        }),
      };

      const service = new (OrderService as any)(
        mockOrderRepo,
        {} /* storeRepo */,
        {} /* itemRepo */,
        {} /* itemVariantRepo */,
        {} /* userRepo */,
        {} /* orderReviewRepo */,
        {} /* buyerReviewRepo */,
        mockDisputeRepo,
        {} /* dataSource */,
        {} /* notificationService */,
        {} /* mailService */,
        {} /* commissionService */,
        {} /* rankingService */,
      );

      await expect(
        service.acceptPaymentNotReceived('order-1', 'buyer-1'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('OrderDisputeService.findOne', () => {
    it('should throw ForbiddenException if user is not buyer, merchant or admin', async () => {
      const mockDisputeRepo: any = {
        findOne: jest.fn().mockResolvedValue({
          id: 'dispute-1',
          requestedById: 'buyer-1',
          order: {
            user: { id: 'buyer-1' },
            store: { owner: { id: 'merchant-1' } },
          },
        }),
      };

      const service = new (OrderDisputeService as any)(
        mockDisputeRepo,
        {} /* orderRepo */,
        {} /* notifService */,
        {} /* rankingService */,
        {} /* mailService */,
      );

      const stranger: any = { id: 'stranger-1', role: UserRole.USER };

      await expect(service.findOne('dispute-1', stranger)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should allow access to buyer, merchant owner and admin', async () => {
      const mockDispute = {
        id: 'dispute-1',
        requestedById: 'buyer-1',
        order: {
          user: { id: 'buyer-1' },
          store: { owner: { id: 'merchant-1' } },
        },
      };
      const mockDisputeRepo: any = {
        findOne: jest.fn().mockResolvedValue(mockDispute),
      };

      const service = new (OrderDisputeService as any)(
        mockDisputeRepo,
        {} /* orderRepo */,
        {} /* notifService */,
        {} /* rankingService */,
        {} /* mailService */,
      );

      const buyer: any = { id: 'buyer-1', role: UserRole.USER };
      const merchant: any = { id: 'merchant-1', role: UserRole.VENDOR };
      const admin: any = { id: 'admin-1', role: UserRole.ADMIN };

      await expect(service.findOne('dispute-1', buyer)).resolves.toEqual(
        mockDispute,
      );
      await expect(service.findOne('dispute-1', merchant)).resolves.toEqual(
        mockDispute,
      );
      await expect(service.findOne('dispute-1', admin)).resolves.toEqual(
        mockDispute,
      );
    });
  });

  describe('NotificationService.checkChatStatusForOrder', () => {
    it('should return FORBIDDEN if requesting user is neither buyer nor store owner', async () => {
      const mockOrderRepo: any = {
        findOne: jest.fn().mockResolvedValue({
          id: 'order-1',
          user: { id: 'buyer-1' },
          store: { owner: { id: 'merchant-1' } },
        }),
      };

      const notifService = Object.create(NotificationService.prototype);
      notifService.orderRepository = mockOrderRepo;

      const result = await notifService.checkChatStatusForOrder(
        'order-1',
        'stranger-1',
      );
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('FORBIDDEN');
    });
  });

  describe('OrderDisputeService.create and escalate lifecycle states', () => {
    it('should start in ADMIN_REVIEW for rejected payment dispute on cancelled order and emit DISPUTE_ESCALATED', async () => {
      const mockOrder = {
        id: 'order-rejected-1',
        status: OrderStatus.CANCELLED,
        user: { id: 'buyer-1' },
        store: { id: 'store-1', owner: { id: 'merchant-1' } },
        payments: [{ id: 'pay-1', status: PaymentStatus.REJECTED }],
      };

      const mockDisputeRepo: any = {
        findOne: jest.fn().mockResolvedValue(null),
        create: jest
          .fn()
          .mockImplementation((data) => ({ ...data, id: 'disp-admin-1' })),
        save: jest.fn().mockImplementation((d) => Promise.resolve(d)),
      };

      const mockOrderRepo: any = {
        findOne: jest.fn().mockResolvedValue(mockOrder),
      };

      const mockNotifService: any = {
        notifyAdminBadgesChanged: jest.fn().mockResolvedValue(undefined),
        notifyAdminActionRequired: jest.fn().mockResolvedValue(undefined),
        create: jest.fn().mockResolvedValue(undefined),
        notifyDisputeUpdated: jest.fn(),
      };

      const service = new (OrderDisputeService as any)(
        mockDisputeRepo,
        mockOrderRepo,
        mockNotifService,
        {} /* mailService */,
        {
          processEvent: jest.fn().mockResolvedValue(undefined),
        } /* rankingService */,
      );

      const buyer: any = { id: 'buyer-1', role: UserRole.USER };

      const result = await service.create(
        {
          orderId: 'order-rejected-1',
          type: DisputeType.REFUND_REQUEST,
          reason: 'Mi pago sí fue debitado con comprobante',
        },
        buyer,
      );

      expect(result.status).toBe(DisputeStatus.ADMIN_REVIEW);
      expect(mockNotifService.notifyAdminActionRequired).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'DISPUTE_ESCALATED',
        }),
      );
      expect(mockNotifService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: NotificationType.DISPUTE_ESCALATED,
          userId: 'merchant-1',
        }),
      );
      expect(mockNotifService.notifyDisputeUpdated).toHaveBeenCalled();
    });

    it('should start in OPEN for normal dispute on non-cancelled order', async () => {
      const mockOrder = {
        id: 'order-normal-1',
        status: OrderStatus.PENDING,
        user: { id: 'buyer-1' },
        store: { id: 'store-1', owner: { id: 'merchant-1' } },
        payments: [{ id: 'pay-1', status: PaymentStatus.APPROVED }],
      };

      const mockDisputeRepo: any = {
        findOne: jest.fn().mockResolvedValue(null),
        create: jest
          .fn()
          .mockImplementation((data) => ({ ...data, id: 'disp-open-1' })),
        save: jest.fn().mockImplementation((d) => Promise.resolve(d)),
      };

      const mockOrderRepo: any = {
        findOne: jest.fn().mockResolvedValue(mockOrder),
      };

      const mockNotifService: any = {
        notifyAdminBadgesChanged: jest.fn().mockResolvedValue(undefined),
        notifyAdminActionRequired: jest.fn().mockResolvedValue(undefined),
        create: jest.fn().mockResolvedValue(undefined),
        notifyDisputeUpdated: jest.fn(),
      };

      const mockMailService: any = {
        sendDisputeOpenedToStore: jest.fn().mockResolvedValue(undefined),
      };

      const service = new (OrderDisputeService as any)(
        mockDisputeRepo,
        mockOrderRepo,
        mockNotifService,
        mockMailService,
        {
          processEvent: jest.fn().mockResolvedValue(undefined),
        } /* rankingService */,
      );

      const buyer: any = { id: 'buyer-1', role: UserRole.USER };

      const result = await service.create(
        {
          orderId: 'order-normal-1',
          type: DisputeType.ITEM_NOT_RECEIVED,
          reason: 'No he recibido mis productos',
        },
        buyer,
      );

      expect(result.status).toBe(DisputeStatus.OPEN);
      expect(mockNotifService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: NotificationType.MEDIATION_REQUEST,
          userId: 'merchant-1',
        }),
      );
      expect(mockNotifService.notifyDisputeUpdated).toHaveBeenCalled();
    });
  });

  describe('NotificationGateway.handleJoinChat', () => {
    it('should deny unauthorized user from joining order chat room', async () => {
      const mockJwtService: any = {
        verifyAsync: jest.fn().mockResolvedValue({ sub: 'stranger-1' }),
      };
      const mockNotifService: any = {
        checkChatStatusForOrder: jest.fn().mockResolvedValue({
          allowed: false,
          reason: 'FORBIDDEN',
        }),
        getChatHistory: jest.fn(),
        markMessagesDelivered: jest.fn(),
      };

      const gateway = new NotificationGateway(mockJwtService, mockNotifService);
      const mockClient: any = {
        id: 'client-1',
        handshake: { auth: { token: 'valid-token' }, headers: {} },
        emit: jest.fn(),
        join: jest.fn(),
      };

      await gateway.handleJoinChat(mockClient, { orderId: 'order-1' });

      expect(mockClient.emit).toHaveBeenCalledWith(
        'chat_access_denied',
        expect.objectContaining({
          orderId: 'order-1',
          message: expect.stringContaining('No tienes autorización'),
        }),
      );
      expect(mockClient.join).not.toHaveBeenCalled();
      expect(mockNotifService.getChatHistory).not.toHaveBeenCalled();
    });
  });
});
