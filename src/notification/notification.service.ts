import { Injectable, Logger, Inject, Optional, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not } from 'typeorm';
import { App } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { Notification, NotificationType } from './entities/notification.entity';
import { ChatMessage } from './entities/chat-message.entity';
import { UserDevice } from './entities/user-device.entity';
import { NotificationGateway } from './notification.gateway';
import { Order } from 'src/order/entities/order.entity';
import { OrderStatus } from 'src/order/types/order-status.enum';
import { User } from 'src/user/entities/user.entity';
import { UserRole } from 'src/user/types';
import { Report, ReportStatus } from 'src/report/entities/report.entity';
import { OrderDispute } from 'src/order-dispute/entities/order-dispute.entity';
import { DisputeStatus } from 'src/order-dispute/types';
import { Store } from 'src/store/entities/store.entity';
import { StoreStatus } from 'src/store/types/status.enum';
import { CommissionPaymentReport } from 'src/commission/entities/commission-payment-report.entity';
import { PaymentReportStatus } from 'src/commission/types';
import { FIREBASE_ADMIN } from './firebase-admin.provider';
import { RegisterDeviceDto } from './dto/register-device.dto';
import { UnregisterDeviceDto } from './dto/unregister-device.dto';
import {
  PenalizeChatUserDto,
  ChatPenaltyTier,
  LiftChatSuspensionDto,
} from './dto/penalize-chat-user.dto';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>,
    @InjectRepository(ChatMessage)
    private readonly chatMessageRepository: Repository<ChatMessage>,
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    @InjectRepository(UserDevice)
    private readonly userDeviceRepository: Repository<UserDevice>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Report)
    private readonly reportRepository: Repository<Report>,
    @InjectRepository(OrderDispute)
    private readonly orderDisputeRepository: Repository<OrderDispute>,
    @InjectRepository(Store)
    private readonly storeRepository: Repository<Store>,
    @InjectRepository(CommissionPaymentReport)
    private readonly commissionPaymentReportRepository: Repository<CommissionPaymentReport>,
    private readonly notificationGateway: NotificationGateway,
    @Optional()
    @Inject(FIREBASE_ADMIN)
    private readonly firebaseApp: App | null,
  ) {}

  async findUserById(userId: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { id: userId } });
  }

  /**
   * Obtiene el resumen consolidado de contadores pendientes para badges del panel de administración.
   */
  async getAdminBadgesSummary() {
    try {
      const [reportsCount, disputesCount, suspendedStoresCount, pendingPaymentReportsCount] =
        await Promise.all([
          this.reportRepository.count({
            where: [
              { status: ReportStatus.PENDING },
              { status: ReportStatus.INVESTIGATING },
            ],
          }),
          this.orderDisputeRepository.count({
            where: { status: DisputeStatus.ADMIN_REVIEW },
          }),
          this.storeRepository.count({
            where: { status: StoreStatus.SUSPENDED },
          }),
          this.commissionPaymentReportRepository.count({
            where: { status: PaymentReportStatus.PENDING_REVIEW },
          }),
        ]);

      return {
        reports: reportsCount,
        disputes: disputesCount,
        storeDebts: suspendedStoresCount + pendingPaymentReportsCount,
        details: {
          suspendedStores: suspendedStoresCount,
          pendingPaymentReports: pendingPaymentReportsCount,
        },
      };
    } catch (err) {
      this.logger.error(`Error calculating admin badges summary: ${err.message}`);
      return {
        reports: 0,
        disputes: 0,
        storeDebts: 0,
        details: { suspendedStores: 0, pendingPaymentReports: 0 },
      };
    }
  }

  /**
   * Notifica a la sala de administradores vía WebSocket que los contadores de badges cambiaron.
   */
  async notifyAdminBadgesChanged() {
    try {
      await this.notificationGateway.emitAdminBadgesUpdate();
    } catch (err) {
      this.logger.error(`Failed to notify admin badges update: ${err.message}`);
    }
  }

  /**
   * Sanitiza un ChatMessage de TypeORM en un DTO limpio para emitir por WebSocket.
   * Evita enviar el objeto Order completo con todas sus relaciones anidadas.
   */
  private toChatMessageDto(message: ChatMessage, orderId: string) {
    return {
      id: message.id,
      orderId,
      sender: message.sender
        ? {
            id: message.sender.id,
            firstName: message.sender.firstName,
            lastName: message.sender.lastName,
          }
        : null,
      content: message.content,
      imageUrl: message.imageUrl,
      createdAt: message.createdAt,
      isRead: message.isRead,
      isDelivered: message.isDelivered,
    };
  }

  async checkChatStatusForOrder(
    orderId: string,
    requestingUserId?: string,
  ): Promise<{
    allowed: boolean;
    reason?:
      | 'NOT_FOUND'
      | 'CHAT_CLOSED'
      | 'CHAT_DISABLED'
      | 'USER_CHAT_SUSPENDED'
      | 'COUNTERPART_CHAT_SUSPENDED';
    isPermanent?: boolean;
    until?: Date | null;
    reasonText?: string | null;
    evidence?: string[] | null;
  }> {
    const order = await this.orderRepository.findOne({
      where: { id: orderId },
      relations: ['store', 'store.owner', 'user'],
    });
    if (!order) {
      return { allowed: false, reason: 'NOT_FOUND' };
    }

    if (requestingUserId) {
      const requestingUser = await this.userRepository.findOne({
        where: { id: requestingUserId },
      });
      if (requestingUser) {
        const now = new Date();
        const isSelfSuspended =
          requestingUser.isChatBannedPermanently ||
          (requestingUser.chatSuspendedUntil &&
            new Date(requestingUser.chatSuspendedUntil) > now);

        if (isSelfSuspended) {
          return {
            allowed: false,
            reason: 'USER_CHAT_SUSPENDED',
            isPermanent: requestingUser.isChatBannedPermanently,
            until: requestingUser.chatSuspendedUntil,
            reasonText: requestingUser.chatSuspensionReason,
            evidence: requestingUser.chatSuspensionEvidence,
          };
        }
      }

      // Check counterpart
      let counterpartUser: User | null = null;
      if (order.user && order.user.id === requestingUserId) {
        counterpartUser = order.store?.owner || null;
      } else if (order.store?.owner && order.store.owner.id === requestingUserId) {
        counterpartUser = order.user || null;
      }

      if (counterpartUser) {
        const freshCounterpart = await this.userRepository.findOne({
          where: { id: counterpartUser.id },
        });
        if (freshCounterpart) {
          const now = new Date();
          const isCounterpartSuspended =
            freshCounterpart.isChatBannedPermanently ||
            (freshCounterpart.chatSuspendedUntil &&
              new Date(freshCounterpart.chatSuspendedUntil) > now);

          if (isCounterpartSuspended) {
            return {
              allowed: false,
              reason: 'COUNTERPART_CHAT_SUSPENDED',
            };
          }
        }
      }
    }

    if (order.store && order.store.allowChat === false) {
      return { allowed: false, reason: 'CHAT_DISABLED' };
    }
    if (
      order.status === OrderStatus.FULLY_PAID ||
      order.status === OrderStatus.CANCELLED
    ) {
      return { allowed: false, reason: 'CHAT_CLOSED' };
    }
    return { allowed: true };
  }

  async getOrderChatHistory(orderId: string, user: User) {
    const order = await this.orderRepository.findOne({
      where: { id: orderId },
      relations: ['store', 'store.owner', 'user'],
    });

    if (!order) {
      throw new NotFoundException(`Orden ${orderId} no encontrada`);
    }

    const isAdmin = user.role === UserRole.ADMIN;
    const isCustomer = order.user?.id === user.id;
    const isStoreOwner = order.store?.owner?.id === user.id;

    if (!isAdmin && !isCustomer && !isStoreOwner) {
      throw new ForbiddenException(
        'No tienes autorización para consultar el chat de esta orden',
      );
    }

    const messages = await this.chatMessageRepository.find({
      where: { order: { id: orderId } },
      relations: ['sender'],
      order: { createdAt: 'ASC' },
    });

    return messages.map((m) => ({
      id: m.id,
      content: m.content,
      imageUrl: m.imageUrl,
      isRead: m.isRead,
      isDelivered: m.isDelivered,
      createdAt: m.createdAt,
      sender: m.sender
        ? {
            id: m.sender.id,
            firstName: m.sender.firstName,
            lastName: m.sender.lastName,
            email: m.sender.email,
            role: m.sender.role,
            avatarUrl: m.sender.avatarUrl,
          }
        : null,
    }));
  }

  async penalizeChatUser(dto: PenalizeChatUserDto) {
    const user = await this.userRepository.findOne({
      where: { id: dto.userId },
    });
    if (!user) {
      throw new NotFoundException(`Usuario con ID ${dto.userId} no encontrado`);
    }

    let title = '';
    let notificationBody = '';
    const now = new Date();

    switch (dto.tier) {
      case ChatPenaltyTier.WARNING:
        title = '⚠️ Advertencia de Moderación de Chat';
        notificationBody = `Has recibido una advertencia formal por infringir las políticas de la comunidad en el chat de órdenes.\nMotivo: ${dto.reason}`;
        break;
      case ChatPenaltyTier.SUSPEND_72H:
        user.chatSuspendedUntil = new Date(now.getTime() + 72 * 60 * 60 * 1000);
        user.isChatBannedPermanently = false;
        user.chatSuspensionReason = dto.reason;
        user.chatSuspensionEvidence = dto.evidenceMessages || [];
        title = '⏱️ Suspensión Temporal de Chat (72 Horas)';
        notificationBody = `Tu acceso al chat de órdenes ha sido suspendido por 72 horas por moderación.\nMotivo: ${dto.reason}`;
        break;
      case ChatPenaltyTier.SUSPEND_15D:
        user.chatSuspendedUntil = new Date(
          now.getTime() + 15 * 24 * 60 * 60 * 1000,
        );
        user.isChatBannedPermanently = false;
        user.chatSuspensionReason = dto.reason;
        user.chatSuspensionEvidence = dto.evidenceMessages || [];
        title = '📅 Suspensión Temporal de Chat (15 Días)';
        notificationBody = `Tu acceso al chat de órdenes ha sido suspendido por 15 días por moderación.\nMotivo: ${dto.reason}`;
        break;
      case ChatPenaltyTier.SUSPEND_30D:
        user.chatSuspendedUntil = new Date(
          now.getTime() + 30 * 24 * 60 * 60 * 1000,
        );
        user.isChatBannedPermanently = false;
        user.chatSuspensionReason = dto.reason;
        user.chatSuspensionEvidence = dto.evidenceMessages || [];
        title = '🗓️ Suspensión Temporal de Chat (30 Días)';
        notificationBody = `Tu acceso al chat de órdenes ha sido suspendido por 30 días por moderación.\nMotivo: ${dto.reason}`;
        break;
      case ChatPenaltyTier.BAN_PERMANENT:
        user.chatSuspendedUntil = null;
        user.isChatBannedPermanently = true;
        user.chatSuspensionReason = dto.reason;
        user.chatSuspensionEvidence = dto.evidenceMessages || [];
        title = '🚫 Suspensión Definitiva de Chat';
        notificationBody = `Tu acceso al chat de órdenes ha sido revocado permanentemente por infracciones graves a las políticas de uso.\nMotivo: ${dto.reason}`;
        break;
    }

    if (dto.evidenceMessages && dto.evidenceMessages.length > 0) {
      notificationBody += `\n\nMensajes citados como evidencia:\n${dto.evidenceMessages.map((msg) => `• "${msg}"`).join('\n')}`;
    }

    await this.userRepository.save(user);

    // Enviar notificación formal in-app
    await this.create({
      userId: user.id,
      title,
      body: notificationBody,
      type: NotificationType.REPORT_RESOLUTION,
    });

    // Enviar evento socket directo al usuario
    this.notificationGateway.sendToUser(user.id, 'chat_penalty_applied', {
      tier: dto.tier,
      reason: dto.reason,
      until: user.chatSuspendedUntil,
      isPermanent: user.isChatBannedPermanently,
      evidence: dto.evidenceMessages || [],
    });

    return {
      success: true,
      message: `Penalización de chat (${dto.tier}) aplicada con éxito`,
      user: {
        id: user.id,
        isChatBannedPermanently: user.isChatBannedPermanently,
        chatSuspendedUntil: user.chatSuspendedUntil,
        chatSuspensionReason: user.chatSuspensionReason,
        chatSuspensionEvidence: user.chatSuspensionEvidence,
      },
    };
  }

  async liftChatSuspension(dto: LiftChatSuspensionDto) {
    const user = await this.userRepository.findOne({
      where: { id: dto.userId },
    });
    if (!user) {
      throw new NotFoundException(`Usuario con ID ${dto.userId} no encontrado`);
    }

    user.chatSuspendedUntil = null;
    user.isChatBannedPermanently = false;
    user.chatSuspensionReason = null;
    user.chatSuspensionEvidence = [];

    await this.userRepository.save(user);

    await this.create({
      userId: user.id,
      title: '✅ Acceso al Chat Restaurado',
      body: 'La administración ha levantado la suspensión de tu acceso al chat de órdenes. Recuerda mantener una comunicación respetuosa.',
      type: NotificationType.REPORT_RESOLUTION,
    });

    this.notificationGateway.sendToUser(user.id, 'chat_suspension_lifted', {
      userId: user.id,
    });

    return {
      success: true,
      message: 'La suspensión del chat ha sido levantada exitosamente',
      user: {
        id: user.id,
        isChatBannedPermanently: false,
        chatSuspendedUntil: null,
      },
    };
  }


  async isOrderActiveForChat(orderId: string): Promise<boolean> {
    const status = await this.checkChatStatusForOrder(orderId);
    return status.allowed;
  }

  closeChatRoom(orderId: string, reason: string): void {
    // Forzar la expulsión de clientes emitiendo el evento
    this.notificationGateway.sendToOrderRoom(orderId, 'chat_closed', {
      orderId,
      reason,
    });
    // Opcional: También podríamos hacer que la pasarela expulse a los sockets (client.leave)
    // pero si el cliente hace context.pop() y luego el screen hace leave_chat al desmontarse,
    // se manejará de forma limpia desde el cliente.
  }

  notifyStoreInstallmentsUpdated(storeId: string, data?: any) {
    if (!storeId) return;
    this.notificationGateway.sendToStore(storeId, 'store_installments_updated', {
      storeId,
      timestamp: new Date().toISOString(),
      ...data,
    });
  }

  async registerDevice(userId: string, dto: RegisterDeviceDto) {
    try {
      let device = await this.userDeviceRepository.findOne({
        where: { userId, deviceId: dto.deviceId },
      });

      if (device) {
        device.fcmToken = dto.fcmToken;
        device.platform = dto.platform || device.platform || 'android';
        device.lastActiveAt = new Date();
      } else {
        device = this.userDeviceRepository.create({
          userId,
          deviceId: dto.deviceId,
          fcmToken: dto.fcmToken,
          platform: dto.platform || 'android',
          lastActiveAt: new Date(),
        });
      }

      const saved = await this.userDeviceRepository.save(device);
      this.logger.log(
        `Registered device ${dto.deviceId} for user ${userId} (${dto.platform || 'android'})`,
      );
      return saved;
    } catch (error) {
      this.logger.error(`Failed to register device: ${error.message}`);
      throw error;
    }
  }

  async unregisterDevice(userId: string, dto: UnregisterDeviceDto) {
    try {
      await this.userDeviceRepository.delete({
        userId,
        deviceId: dto.deviceId,
      });
      this.logger.log(`Unregistered device ${dto.deviceId} for user ${userId}`);
      return { success: true };
    } catch (error) {
      this.logger.error(`Failed to unregister device: ${error.message}`);
      throw error;
    }
  }

  private async sendPushNotification(
    userId: string,
    payload: {
      notificationId: string;
      title: string;
      body: string;
      type: string;
      orderId?: string;
      targetId?: string;
      storeId?: string;
    },
  ) {
    if (!this.firebaseApp) return;

    try {
      const devices = await this.userDeviceRepository.find({
        where: { userId },
      });

      if (!devices || devices.length === 0) return;

      const tokens = devices.map((d) => d.fcmToken).filter(Boolean);
      if (tokens.length === 0) return;

      const response = await getMessaging(this.firebaseApp).sendEachForMulticast({
        tokens,
        notification: {
          title: payload.title,
          body: payload.body,
        },
        data: {
          notificationId: payload.notificationId,
          type: payload.type,
          storeId: payload.storeId || '',
          orderId: payload.orderId || '',
          targetId: payload.targetId || payload.orderId || '',
          click_action: 'FLUTTER_NOTIFICATION_CLICK',
        },
        android: {
          priority: 'high',
          notification: {
            channelId: 'high_importance_channel',
            sound: 'default',
            priority: 'high',
          },
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: 1,
            },
          },
        },
      });

      // Cleanup de tokens inválidos o expirados (Task 1.5)
      const tokensToDelete: string[] = [];
      response.responses.forEach((resp, index) => {
        if (!resp.success && resp.error) {
          const code = resp.error.code;
          if (
            code === 'messaging/registration-token-not-registered' ||
            code === 'messaging/invalid-registration-token'
          ) {
            tokensToDelete.push(tokens[index]);
          }
        }
      });

      if (tokensToDelete.length > 0) {
        this.logger.log(
          `Removing ${tokensToDelete.length} obsolete FCM tokens for user ${userId}`,
        );
        await this.userDeviceRepository
          .createQueryBuilder()
          .delete()
          .where('fcmToken IN (:...tokensToDelete)', { tokensToDelete })
          .execute();
      }
    } catch (error) {
      this.logger.error(
        `Error sending push notification to user ${userId}: ${error.message}`,
      );
    }
  }

  private async sendPushNotificationToStore(
    storeId: string,
    payload: {
      notificationId: string;
      title: string;
      body: string;
      type: string;
      orderId?: string;
      targetId?: string;
    },
  ) {
    if (!this.firebaseApp || !storeId) return;

    try {
      const devices = await this.userDeviceRepository
        .createQueryBuilder('device')
        .innerJoin('device.user', 'user')
        .innerJoin(
          'stores',
          'store',
          'store.id = :storeId AND (store."ownerId" = user.id OR (store."companyId" IS NOT NULL AND user."companyId" = store."companyId") OR user."storeId" = store.id)',
          { storeId },
        )
        .getMany();

      if (!devices || devices.length === 0) return;

      const tokens = Array.from(
        new Set(devices.map((d) => d.fcmToken).filter(Boolean)),
      );
      if (tokens.length === 0) return;

      const response = await getMessaging(this.firebaseApp).sendEachForMulticast({
        tokens,
        notification: {
          title: payload.title,
          body: payload.body,
        },
        data: {
          notificationId: payload.notificationId,
          type: payload.type,
          storeId: storeId || '',
          orderId: payload.orderId || '',
          targetId: payload.targetId || payload.orderId || '',
          mediationId:
            payload.type === NotificationType.MEDIATION_REQUEST && !payload.orderId
              ? payload.targetId || ''
              : '',
          click_action: 'FLUTTER_NOTIFICATION_CLICK',
        },
        android: {
          priority: 'high',
          notification: {
            channelId: 'high_importance_channel',
            sound: 'default',
            priority: 'high',
          },
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: 1,
            },
          },
        },
      });

      const tokensToDelete: string[] = [];
      response.responses.forEach((resp, index) => {
        if (!resp.success && resp.error) {
          const code = resp.error.code;
          if (
            code === 'messaging/registration-token-not-registered' ||
            code === 'messaging/invalid-registration-token'
          ) {
            tokensToDelete.push(tokens[index]);
          }
        }
      });

      if (tokensToDelete.length > 0) {
        await this.userDeviceRepository
          .createQueryBuilder()
          .delete()
          .where('fcmToken IN (:...tokensToDelete)', { tokensToDelete })
          .execute();
      }
    } catch (error) {
      this.logger.error(
        `Error sending push notification to store ${storeId}: ${error.message}`,
      );
    }
  }

  async create(data: {
    userId: string;
    title: string;
    body: string;
    type: NotificationType;
    targetId?: string;
    orderId?: string;
    storeId?: string;
  }) {
    try {
      let notification: Notification;
      const targetId = data.targetId || data.orderId;

      // Si tiene targetId, intentamos buscar una existente para actualizarla (evitar duplicados de chat o pedidos)
      if (targetId) {
        const existing = await this.notificationRepository.findOne({
          where: {
            userId: data.userId,
            type: data.type,
            targetId,
          },
        });

        if (existing) {
          notification = existing;
          notification.title = data.title;
          notification.body = data.body;
          notification.isRead = false; // Marcar como no leída al actualizar
          notification.createdAt = new Date(); // Actualizar fecha para que suba en la lista
        } else {
          notification = this.notificationRepository.create({
            userId: data.userId,
            title: data.title,
            body: data.body,
            type: data.type,
            targetId,
          });
        }
      } else {
        notification = this.notificationRepository.create(data);
      }

      const savedNotification =
        await this.notificationRepository.save(notification);

      // 1. Emit via WebSocket to user
      this.notificationGateway.sendToUser(
        data.userId,
        'new_notification',
        savedNotification,
      );

      // 2. Dispatch FCM push notification to user's devices
      const isStoreMediation =
        (data.type === NotificationType.MEDIATION_RESPONSE ||
          data.type === NotificationType.MEDIATION_REQUEST) &&
        (Boolean(data.storeId) ||
          data.title?.toLowerCase().includes('mediaci') ||
          data.body?.toLowerCase().includes('mediaci'));

      const isOrderRelated =
        !isStoreMediation &&
        (data.type === NotificationType.ORDER_CREATED ||
          data.type === NotificationType.ORDER_APPROVED ||
          data.type === NotificationType.ORDER_REJECTED ||
          data.type === NotificationType.PAYMENT_REPORTED ||
          data.type === NotificationType.PAYMENT_APPROVED ||
          data.type === NotificationType.PAYMENT_REJECTED ||
          data.type === NotificationType.CHAT_MESSAGE ||
          data.type === NotificationType.MEDIATION_RESPONSE ||
          data.type === NotificationType.ORDER_REVIEW_PROMPT ||
          data.type === NotificationType.BUYER_REVIEW_PROMPT ||
          data.type === NotificationType.ORDER_REVIEW_RECEIVED ||
          data.type === NotificationType.ORDER_REVIEW_REPLIED ||
          data.type === NotificationType.BUYER_REVIEW_RECEIVED);

      await this.sendPushNotification(data.userId, {
        notificationId: savedNotification.id,
        title: data.title,
        body: data.body,
        type: data.type,
        orderId:
          data.orderId ||
          (isOrderRelated && data.type !== NotificationType.MEDIATION_REQUEST
            ? targetId
            : ''),
        targetId: targetId || '',
        storeId: data.storeId || (isStoreMediation ? targetId : ''),
      });

      // 3. Si se proporcionó un storeId, emitir también a la sala de la tienda y notificar actualización de cuotas
      if (data.storeId) {
        this.notificationGateway.sendToStore(
          data.storeId,
          'new_notification',
          savedNotification,
        );
        this.notifyStoreInstallmentsUpdated(data.storeId, {
          orderId: targetId,
          type: data.type,
        });

        // Push notification a dispositivos de la tienda para eventos de disputa o pedidos
        if (
          data.type === NotificationType.MEDIATION_REQUEST ||
          data.type === NotificationType.ORDER_CREATED
        ) {
          await this.sendPushNotificationToStore(data.storeId, {
            notificationId: savedNotification.id,
            title: data.title,
            body: data.body,
            type: data.type,
            orderId: data.orderId || '',
            targetId: targetId,
          });
        }
      }

      return savedNotification;
    } catch (error) {
      this.logger.error(`Failed to create notification: ${error.message}`);
      // We don't throw here to avoid breaking the caller's transaction if notifications fail
    }
  }

  async getUnreadDisputeOrderIds(userId: string): Promise<string[]> {
    const notifications = await this.notificationRepository.find({
      where: [
        {
          userId,
          isRead: false,
          type: NotificationType.MEDIATION_RESPONSE,
        },
        {
          userId,
          isRead: false,
          type: NotificationType.MEDIATION_REQUEST,
        },
      ],
      select: ['targetId'],
    });

    const orderIds = new Set<string>();
    for (const n of notifications) {
      if (n.targetId) {
        orderIds.add(n.targetId);
      }
    }
    return Array.from(orderIds);
  }

  async markDisputeNotificationsAsRead(
    userId: string,
    orderId: string,
  ): Promise<void> {
    await this.notificationRepository
      .createQueryBuilder()
      .update(Notification)
      .set({ isRead: true })
      .where('userId = :userId', { userId })
      .andWhere('targetId = :orderId', { orderId })
      .andWhere('type IN (:...types)', {
        types: [
          NotificationType.MEDIATION_RESPONSE,
          NotificationType.MEDIATION_REQUEST,
        ],
      })
      .execute();
  }

  async findAllByUser(userId: string) {
    return this.notificationRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: 50,
    });
  }

  async markAsRead(id: string) {
    await this.notificationRepository.update(id, { isRead: true });
  }

  async saveMessage(
    orderId: string,
    senderId: string,
    content: string,
    imageUrl?: string,
  ) {
    const order = await this.orderRepository.findOne({
      where: { id: orderId },
      relations: [
        'store',
        'store.owner',
        'store.company',
        'store.company.owner',
        'user',
      ],
    });
    if (!order) return null;

    const sender = await this.chatMessageRepository.manager.findOne(User, {
      where: { id: senderId },
    });

    const message = this.chatMessageRepository.create({
      order,
      sender: sender || ({ id: senderId } as User),
      content: content || (imageUrl ? '📷 Imagen adjunta' : ''),
      imageUrl,
    });

    const savedMessage = await this.chatMessageRepository.save(message);

    // Emitir a la sala de la orden (DTO sanitizado, sin el objeto Order anidado)
    const messageDto = this.toChatMessageDto(savedMessage, orderId);
    this.notificationGateway.sendToOrderRoom(
      orderId,
      'new_chat_message',
      messageDto,
    );

    // También notificar al destinatario si no está en la sala (notificación push simulada)
    const recipientId =
      senderId === order.user.id
        ? order.store.owner?.id || order.store.company?.owner?.id
        : order.user.id;

    if (recipientId) {
      const isToBusiness = senderId === order.user.id;
      const senderName = isToBusiness
        ? `${order.user.firstName} ${order.user.lastName}`
        : order.store.name;

      const title = isToBusiness
        ? `Un cliente envió un mensaje a ${order.store.name}`
        : `Nuevo mensaje de ${order.store.name}`;

      const shortOrderId = orderId.substring(0, 8).toUpperCase();
      const body = isToBusiness
        ? `Orden #${shortOrderId}: ${content.length > 80 ? content.substring(0, 77) + '...' : content}`
        : content.length > 100
          ? content.substring(0, 97) + '...'
          : content;

      await this.create({
        userId: recipientId,
        title,
        body,
        type: NotificationType.CHAT_MESSAGE,
        targetId: orderId,
      });

      this.notificationGateway.sendToUser(recipientId, 'chat_notification', {
        orderId,
        senderName: isToBusiness ? senderName : order.store.name,
        content: content.substring(0, 50) + (content.length > 50 ? '...' : ''),
      });
    }

    return savedMessage;
  }

  async markMessagesRead(orderId: string, readerId: string) {
    // Marcar como leídos los mensajes de la orden donde el remitente NO sea quien está leyendo
    const updateResult = await this.chatMessageRepository.update(
      {
        order: { id: orderId },
        isRead: false,
        sender: { id: Not(readerId) },
      },
      { isRead: true, isDelivered: true },
    );

    if (updateResult.affected && updateResult.affected > 0) {
      // Notificar a la sala que los mensajes han sido leídos
      this.notificationGateway.sendToOrderRoom(orderId, 'messages_read', {
        orderId,
        readBy: readerId,
        timestamp: new Date().toISOString(),
      });
    }
  }

  async markMessagesDelivered(orderId: string, recipientId: string) {
    const updateResult = await this.chatMessageRepository.update(
      {
        order: { id: orderId },
        isDelivered: false,
        sender: { id: Not(recipientId) },
      },
      { isDelivered: true },
    );

    if (updateResult.affected && updateResult.affected > 0) {
      this.notificationGateway.sendToOrderRoom(orderId, 'messages_delivered', {
        orderId,
        deliveredTo: recipientId,
      });
    }
  }

  async getChatHistory(orderId: string) {
    const messages = await this.chatMessageRepository.find({
      where: { order: { id: orderId } },
      relations: ['sender'],
      order: { createdAt: 'ASC' },
      take: 100,
    });
    return messages.map((m) => this.toChatMessageDto(m, orderId));
  }
}
