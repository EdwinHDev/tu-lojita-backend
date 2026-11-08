jest.mock('@nestjs/common/utils/load-package.util', () => ({
  loadPackage: jest.fn(),
}));

jest.mock('@nestjs/typeorm', () => ({
  InjectRepository: () => () => undefined,
}));

jest.mock('./notification.gateway', () => ({
  NotificationGateway: class {},
  AdminActionType: {},
}));

import { NotificationService } from './notification.service';
import { NotificationType } from './entities/notification.entity';

const mockSendEachForMulticast = jest.fn();

jest.mock('firebase-admin/messaging', () => ({
  getMessaging: jest.fn(() => ({
    sendEachForMulticast: mockSendEachForMulticast,
  })),
}));

describe('NotificationService FCM Push Payload & Deep-Link Metadata', () => {
  let service: NotificationService;
  let mockNotifRepo: any;
  let mockOrderRepo: any;
  let mockUserDeviceRepo: any;
  let mockStoreRepo: any;
  let mockCollaboratorRepo: any;
  let mockGateway: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockSendEachForMulticast.mockResolvedValue({
      successCount: 1,
      failureCount: 0,
      responses: [{ success: true }],
    });

    mockNotifRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation((dto) => ({
        id: 'notif-uuid-1',
        createdAt: new Date(),
        isRead: false,
        ...dto,
      })),
      save: jest.fn().mockImplementation((entity) =>
        Promise.resolve({
          id: entity.id || 'notif-uuid-1',
          ...entity,
        }),
      ),
    };

    mockOrderRepo = {
      findOne: jest.fn().mockResolvedValue(null),
    };

    mockUserDeviceRepo = {
      find: jest.fn().mockResolvedValue([
        {
          id: 'dev-1',
          userId: 'user-1',
          fcmToken: 'fcm-token-android-1',
          platform: 'android',
          deviceId: 'device-1',
        },
      ]),
      createQueryBuilder: jest.fn(() => ({
        delete: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 0 }),
      })),
    };

    mockStoreRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 'store-uuid-1',
        owner: { id: 'merchant-1' },
        company: { id: 'company-1', owner: { id: 'merchant-1' } },
      }),
    };

    mockCollaboratorRepo = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
    };

    mockGateway = {
      sendToUser: jest.fn(),
      sendToStore: jest.fn(),
    };

    service = new NotificationService(
      mockNotifRepo,
      {} as any,
      mockOrderRepo,
      mockUserDeviceRepo,
      {} as any,
      {} as any,
      {} as any,
      mockStoreRepo,
      mockCollaboratorRepo,
      {} as any,
      {} as any,
      mockGateway,
      { name: 'mock-firebase-app' } as any,
    );
  });

  it('omits clickAction and click_action from Android FCM payload while preserving routing fields', async () => {
    await service.create({
      userId: 'user-1',
      title: 'Nuevo mensaje de soporte',
      body: 'Tu caso ha sido actualizado.',
      type: NotificationType.CHAT_MESSAGE,
      targetId: 'order-uuid-99',
      orderId: 'order-uuid-99',
      storeId: 'store-uuid-1',
      channelType: 'DISPUTE_BUYER_SUPPORT',
    });

    expect(mockSendEachForMulticast).toHaveBeenCalledTimes(1);
    const multicastArg = mockSendEachForMulticast.mock.calls[0][0];

    expect(multicastArg.tokens).toEqual(['fcm-token-android-1']);
    expect(multicastArg.android.priority).toBe('high');
    expect(multicastArg.android.notification.channelId).toBe(
      'high_importance_channel',
    );
    expect(multicastArg.android.notification.clickAction).toBeUndefined();
    expect(multicastArg.data.click_action).toBeUndefined();

    expect(multicastArg.data).toMatchObject({
      notificationId: 'notif-uuid-1',
      title: 'Nuevo mensaje de soporte',
      body: 'Tu caso ha sido actualizado.',
      type: NotificationType.CHAT_MESSAGE,
      channelType: 'DISPUTE_BUYER_SUPPORT',
      storeId: 'store-uuid-1',
      orderId: 'order-uuid-99',
      targetId: 'order-uuid-99',
    });
  });

  it('populates orderId in FCM data for GENERAL notifications when targetId references an existing order', async () => {
    mockOrderRepo.findOne.mockResolvedValue({
      id: 'order-installment-42',
      store: {
        id: 'store-uuid-1',
        owner: { id: 'merchant-1' },
      },
    });

    await service.create({
      userId: 'user-1',
      storeId: 'store-uuid-1',
      title: 'Recordatorio de cuota próxima a vencer',
      body: 'Tu cuota #2 vence mañana.',
      type: NotificationType.GENERAL,
      targetId: 'order-installment-42',
    });

    expect(mockSendEachForMulticast).toHaveBeenCalledTimes(1);
    const multicastArg = mockSendEachForMulticast.mock.calls[0][0];

    expect(multicastArg.data.orderId).toBe('order-installment-42');
    expect(multicastArg.data.targetId).toBe('order-installment-42');
    expect(multicastArg.android.notification.clickAction).toBeUndefined();
  });

  it('keeps orderId empty for GENERAL broadcast notifications without a matching order', async () => {
    mockOrderRepo.findOne.mockResolvedValue(null);

    await service.create({
      userId: 'user-1',
      title: 'Mantenimiento programado',
      body: 'Estaremos realizando mejoras esta noche.',
      type: NotificationType.GENERAL,
    });

    expect(mockSendEachForMulticast).toHaveBeenCalledTimes(1);
    const multicastArg = mockSendEachForMulticast.mock.calls[0][0];

    expect(multicastArg.data.orderId).toBe('');
    expect(multicastArg.data.targetId).toBe('');
  });

  it('preserves store mediation routing metadata without misclassifying mediationId as orderId', async () => {
    await service.create({
      userId: 'merchant-1',
      storeId: 'store-uuid-1',
      title: 'Nueva solicitud de mediación',
      body: 'Un cliente bloqueado envió una apelación.',
      type: NotificationType.MEDIATION_REQUEST,
      targetId: 'mediation-req-77',
    });

    expect(mockSendEachForMulticast).toHaveBeenCalledTimes(1);
    const multicastArg = mockSendEachForMulticast.mock.calls[0][0];

    expect(multicastArg.data.orderId).toBe('');
    expect(multicastArg.data.storeId).toBe('store-uuid-1');
    expect(multicastArg.data.targetId).toBe('mediation-req-77');
    expect(multicastArg.data.mediationId).toBe('mediation-req-77');
  });
});
