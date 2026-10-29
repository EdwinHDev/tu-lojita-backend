import {
  Injectable,
  Logger,
  Inject,
  Optional,
  NotFoundException,
  ForbiddenException,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not, In } from 'typeorm';
import { randomUUID } from 'crypto';
import { App } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { Notification, NotificationType } from './entities/notification.entity';
import { ChatMessage, ChatChannelType } from './entities/chat-message.entity';
import { UserDevice } from './entities/user-device.entity';
import {
  NotificationGateway,
  AdminActionPayload,
  AdminActionType,
} from './notification.gateway';
import { Order } from 'src/order/entities/order.entity';
import { OrderStatus } from 'src/order/types/order-status.enum';
import { PaymentStatus } from 'src/payment/types';
import { User } from 'src/user/entities/user.entity';
import { UserRole } from 'src/user/types';
import { Report, ReportStatus } from 'src/report/entities/report.entity';
import { OrderDispute } from 'src/order-dispute/entities/order-dispute.entity';
import { DisputeStatus } from 'src/order-dispute/types';
import { Store } from 'src/store/entities/store.entity';
import { StoreStatus } from 'src/store/types/status.enum';
import { CompanyCollaborator } from 'src/company/entities/company-collaborator.entity';
import { CommissionPaymentReport } from 'src/commission/entities/commission-payment-report.entity';
import { PaymentReportStatus } from 'src/commission/types';
import { CompanySubscription } from 'src/subscription/entities/company-subscription.entity';
import { SubscriptionStatus } from 'src/subscription/types';
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
    @InjectRepository(CompanyCollaborator)
    private readonly collaboratorRepository: Repository<CompanyCollaborator>,
    @InjectRepository(CommissionPaymentReport)
    private readonly commissionPaymentReportRepository: Repository<CommissionPaymentReport>,
    @InjectRepository(CompanySubscription)
    private readonly companySubscriptionRepository: Repository<CompanySubscription>,
    @Inject(forwardRef(() => NotificationGateway))
    private readonly notificationGateway: NotificationGateway,
    @Optional()
    @Inject(FIREBASE_ADMIN)
    private readonly firebaseApp: App | null,
  ) {}

  /**
   * Verifica si un userId corresponde a un colaborador activo con acceso a la sucursal
   * y al menos uno de los permisos requeridos.
   */
  private async checkCollaboratorOrderAccess(
    userId: string,
    storeId?: string,
    companyId?: string,
    requiredPermissions: string[] = [],
  ): Promise<CompanyCollaborator | null> {
    if (!userId || (!storeId && !companyId)) return null;

    const collaborator = await this.collaboratorRepository.findOne({
      where: { id: userId, isActive: true },
      relations: ['company', 'role', 'role.permissions', 'stores'],
    });

    if (!collaborator) return null;

    let resolvedCompanyId = companyId;
    if (!resolvedCompanyId && storeId) {
      const store = await this.storeRepository.findOne({
        where: { id: storeId },
        relations: ['company'],
      });
      resolvedCompanyId = store?.company?.id;
    }

    if (!resolvedCompanyId || collaborator.company?.id !== resolvedCompanyId) {
      return null;
    }

    if (storeId && !collaborator.hasFullBranchAccess) {
      const hasBranch = (collaborator.stores || []).some(
        (s) => s.id === storeId,
      );
      if (!hasBranch) return null;
    }

    if (requiredPermissions.length > 0) {
      const perms = (collaborator.role?.permissions || []).map(
        (p) => p.permission,
      );
      const hasPerm = requiredPermissions.some((reqPerm) =>
        perms.includes(reqPerm),
      );
      if (!hasPerm) return null;
    }

    return collaborator;
  }

  /**
   * Evalúa según la matriz oficial de permisos si un colaborador con `permissions`
   * debe recibir/ver una notificación específica de una sucursal.
   */
  canCollaboratorReceiveNotification(
    permissions: string[],
    notification: {
      type: NotificationType | string;
      channelType?: string | null;
      title?: string | null;
      body?: string | null;
    },
  ): boolean {
    if (!permissions || permissions.length === 0) return false;
    const hasAny = (required: string[]) =>
      required.some((r) => permissions.includes(r));

    const type = notification.type;
    const titleLower = (notification.title || '').toLowerCase();
    const bodyLower = (notification.body || '').toLowerCase();

    switch (type) {
      case NotificationType.ORDER_CREATED:
      case NotificationType.ORDER_APPROVED:
      case NotificationType.ORDER_REJECTED:
        return hasAny(['orders:view', 'orders:process', 'orders:cancel']);

      case NotificationType.PAYMENT_REPORTED:
        return hasAny([
          'orders:process',
          'installments:view',
          'installments:approve_payment',
        ]);

      case NotificationType.PAYMENT_APPROVED:
      case NotificationType.PAYMENT_REJECTED:
      case NotificationType.REFUND_REPORTED:
      case NotificationType.REFUND_CONFIRMED:
        return hasAny([
          'orders:view',
          'orders:process',
          'installments:view',
          'installments:approve_payment',
        ]);

      case NotificationType.CHAT_MESSAGE: {
        const isSupport =
          notification.channelType ===
            ChatChannelType.DISPUTE_MERCHANT_SUPPORT ||
          notification.channelType === ChatChannelType.DISPUTE_BUYER_SUPPORT ||
          titleLower.includes('soporte') ||
          bodyLower.includes('soporte');
        if (isSupport) {
          return hasAny(['disputes:view', 'disputes:respond']);
        }
        return hasAny(['orders:chat']);
      }

      case NotificationType.MEDIATION_REQUEST:
      case NotificationType.MEDIATION_RESPONSE:
      case NotificationType.DISPUTE_ESCALATED:
        return hasAny(['disputes:view', 'disputes:respond']);

      case NotificationType.ITEM_HIDDEN:
        return hasAny(['items:view', 'items:edit', 'items:create']);

      case NotificationType.ORDER_REVIEW_RECEIVED:
      case NotificationType.BUYER_REVIEW_PROMPT:
      case NotificationType.ORDER_REVIEW_PROMPT:
      case NotificationType.ORDER_REVIEW_REPLIED:
      case NotificationType.BUYER_REVIEW_RECEIVED:
        return hasAny(['orders:view', 'orders:process']);

      case NotificationType.STRIKE_APPLIED:
      case NotificationType.STORE_SUSPENDED:
      case NotificationType.STORE_FLAGGED:
        return hasAny(['settings:manage']);

      case NotificationType.ACHIEVEMENT_UNLOCKED:
      case NotificationType.DIVISION_UP:
      case NotificationType.DIVISION_DOWN:
      case NotificationType.WEEKLY_RANKING_SUMMARY:
      case NotificationType.STREAK_EXPIRING:
      case NotificationType.CATEGORY_RIVALRY:
      case NotificationType.RANK_SHIELD_EXPIRING:
      case NotificationType.DANGER_ZONE_ALERT:
        return hasAny(['reports:view', 'settings:manage']);

      case NotificationType.GENERAL: {
        if (
          titleLower.includes('prórroga') ||
          titleLower.includes('prorroga')
        ) {
          return hasAny([
            'installments:view',
            'installments:approve_payment',
            'orders:process',
          ]);
        }
        return hasAny(['orders:view', 'orders:process', 'orders:cancel']);
      }

      default:
        return false;
    }
  }

  /**
   * Obtiene la lista de IDs de colaboradores activos de la empresa dueña de `storeId`
   * que tienen acceso a la sucursal y cuentan con el permiso requerido para la notificación.
   */
  private async getAuthorizedCollaboratorsForStoreNotification(
    storeId: string,
    notification: {
      type: NotificationType | string;
      channelType?: string | null;
      title?: string | null;
      body?: string | null;
    },
  ): Promise<string[]> {
    if (!storeId) return [];

    try {
      const store = await this.storeRepository.findOne({
        where: { id: storeId },
        relations: ['company'],
      });
      if (!store?.company?.id) return [];

      const collaborators = await this.collaboratorRepository.find({
        where: { company: { id: store.company.id }, isActive: true },
        relations: ['role', 'role.permissions', 'stores'],
      });

      const authorizedIds: string[] = [];
      for (const collab of collaborators) {
        const hasBranchAccess =
          collab.hasFullBranchAccess ||
          (collab.stores || []).some((s) => s.id === storeId);
        if (!hasBranchAccess) continue;

        const permissions = (collab.role?.permissions || []).map(
          (p) => p.permission,
        );
        if (this.canCollaboratorReceiveNotification(permissions, notification)) {
          authorizedIds.push(collab.id);
        }
      }
      return authorizedIds;
    } catch (err) {
      this.logger.warn(
        `Error resolving authorized collaborators for store ${storeId}: ${err.message}`,
      );
      return [];
    }
  }

  async findUserById(userId: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { id: userId } });
  }

  /**
   * Obtiene el resumen consolidado de contadores pendientes para badges del panel de administración.
   */
  async getAdminBadgesSummary() {
    try {
      const [
        reportsCount,
        disputesCount,
        suspendedStoresCount,
        pendingPaymentReportsCount,
        pendingCompaniesCount,
      ] = await Promise.all([
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
        this.companySubscriptionRepository.count({
          where: { status: SubscriptionStatus.PENDING_VERIFICATION },
        }),
      ]);

      return {
        reports: reportsCount,
        disputes: disputesCount,
        storeDebts: suspendedStoresCount + pendingPaymentReportsCount,
        pendingCompanies: pendingCompaniesCount,
        subscriptions: pendingCompaniesCount,
        details: {
          suspendedStores: suspendedStoresCount,
          pendingPaymentReports: pendingPaymentReportsCount,
          pendingCompanies: pendingCompaniesCount,
          pendingSubscriptions: pendingCompaniesCount,
        },
      };
    } catch (err) {
      this.logger.error(
        `Error calculating admin badges summary: ${err.message}`,
      );
      return {
        reports: 0,
        disputes: 0,
        storeDebts: 0,
        pendingCompanies: 0,
        subscriptions: 0,
        details: {
          suspendedStores: 0,
          pendingPaymentReports: 0,
          pendingCompanies: 0,
          pendingSubscriptions: 0,
        },
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
   * Transmite un evento de acción inmediata requerida al panel de administración vía WebSocket.
   */
  async notifyAdminActionRequired(payload: {
    type: AdminActionType;
    title: string;
    message: string;
    entityId: string;
    link: string;
    metadata?: Record<string, any>;
  }) {
    try {
      const fullPayload: AdminActionPayload = {
        id: randomUUID(),
        createdAt: new Date().toISOString(),
        ...payload,
      };
      await this.notificationGateway.emitAdminActionRequired(fullPayload);
    } catch (err) {
      this.logger.error(
        `Failed to notify admin action required: ${err.message}`,
      );
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
      channelType: message.channelType || ChatChannelType.DIRECT,
      senderId: message.sender?.id,
      sender: message.sender
        ? {
            id: message.sender.id,
            firstName: message.sender.firstName,
            lastName: message.sender.lastName,
            email: message.sender.email,
            role: message.sender.role,
            avatarUrl: message.sender.avatarUrl,
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
      | 'COUNTERPART_CHAT_SUSPENDED'
      | 'FORBIDDEN';
    isPermanent?: boolean;
    until?: Date | null;
    reasonText?: string | null;
    evidence?: string[] | null;
  }> {
    const order = await this.orderRepository.findOne({
      where: { id: orderId },
      relations: [
        'store',
        'store.owner',
        'store.company',
        'store.company.owner',
        'user',
        'payments',
      ],
    });
    if (!order) {
      return { allowed: false, reason: 'NOT_FOUND' };
    }

    if (requestingUserId) {
      const isBuyer = order.user?.id === requestingUserId;
      const isStoreOwner =
        order.store?.owner?.id === requestingUserId ||
        order.store?.company?.owner?.id === requestingUserId;

      let isAuthorizedCollaborator = false;
      if (!isBuyer && !isStoreOwner) {
        const collab = await this.checkCollaboratorOrderAccess(
          requestingUserId,
          order.store?.id,
          order.store?.company?.id,
          ['orders:chat'],
        );
        isAuthorizedCollaborator = Boolean(collab);
      }

      if (!isBuyer && !isStoreOwner && !isAuthorizedCollaborator) {
        return { allowed: false, reason: 'FORBIDDEN' };
      }

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
      if (isBuyer) {
        counterpartUser =
          order.store?.owner || order.store?.company?.owner || null;
      } else if (isStoreOwner || isAuthorizedCollaborator) {
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
    if (order.status === OrderStatus.FULLY_PAID) {
      return { allowed: false, reason: 'CHAT_CLOSED' };
    }
    if (order.status === OrderStatus.CANCELLED) {
      const hasPendingRefund = order.payments?.some(
        (p) =>
          p.status === PaymentStatus.WAITING_VERIFICATION ||
          p.status === PaymentStatus.REFUND_PENDING ||
          p.status === PaymentStatus.PENDING,
      );

      let hasActiveDispute = false;
      if (this.orderDisputeRepository) {
        const dispute = await this.orderDisputeRepository.findOne({
          where: {
            orderId,
            status: In([
              DisputeStatus.OPEN,
              DisputeStatus.MERCHANT_RESPONDED,
              DisputeStatus.ADMIN_REVIEW,
            ]),
          },
        });
        if (dispute) hasActiveDispute = true;
      }

      if (!hasPendingRefund && !hasActiveDispute) {
        return { allowed: false, reason: 'CHAT_CLOSED' };
      }
    }
    return { allowed: true };
  }

  async isUserOrderParticipant(
    orderId: string,
    userId: string,
  ): Promise<boolean> {
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
    if (!order) return false;
    const isBuyer = order.user?.id === userId;
    const isStoreOwner =
      order.store?.owner?.id === userId ||
      order.store?.company?.owner?.id === userId;
    if (isBuyer || isStoreOwner) return true;

    const collab = await this.checkCollaboratorOrderAccess(
      userId,
      order.store?.id,
      order.store?.company?.id,
      ['orders:chat', 'disputes:view', 'disputes:respond'],
    );
    return Boolean(collab);
  }

  async checkSupportChatStatusForOrder(
    orderId: string,
    requestingUserId: string,
    channelType: ChatChannelType,
  ): Promise<{
    allowed: boolean;
    reason?: 'NOT_FOUND' | 'FORBIDDEN' | 'CHAT_CLOSED';
    order?: Order;
  }> {
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

    if (!order) return { allowed: false, reason: 'NOT_FOUND' };

    const requestingUser = await this.userRepository.findOne({
      where: { id: requestingUserId },
    });

    const isAdmin =
      requestingUser?.role === UserRole.ADMIN ||
      (requestingUser as any)?.role === 'ADMIN';

    if (isAdmin) {
      return { allowed: true, order };
    }

    // Verificar si la disputa asociada ya se encuentra en un estado terminal resuelto
    const dispute = await this.orderDisputeRepository.findOne({
      where: { orderId },
      order: { createdAt: 'DESC' },
    });

    if (
      dispute &&
      (dispute.status === DisputeStatus.RESOLVED ||
        dispute.status === DisputeStatus.REFUNDED ||
        dispute.status === DisputeStatus.REJECTED)
    ) {
      return { allowed: false, reason: 'CHAT_CLOSED', order };
    }

    if (channelType === ChatChannelType.DISPUTE_BUYER_SUPPORT) {
      if (order.user?.id === requestingUserId) {
        return { allowed: true, order };
      }
      return { allowed: false, reason: 'FORBIDDEN' };
    }

    if (channelType === ChatChannelType.DISPUTE_MERCHANT_SUPPORT) {
      const storeOwnerId =
        order.store?.owner?.id || order.store?.company?.owner?.id;
      if (storeOwnerId === requestingUserId) {
        return { allowed: true, order };
      }
      const collab = await this.checkCollaboratorOrderAccess(
        requestingUserId,
        order.store?.id,
        order.store?.company?.id,
        ['disputes:view', 'disputes:respond'],
      );
      if (collab) {
        return { allowed: true, order };
      }
      return { allowed: false, reason: 'FORBIDDEN' };
    }

    return { allowed: false, reason: 'FORBIDDEN' };
  }

  notifySupportChatClosed(orderId: string, payload: any) {
    const buyerRoom = `order_support_chat_${orderId}_buyer`;
    const merchantRoom = `order_support_chat_${orderId}_merchant`;
    this.notificationGateway.sendToCustomRoom(
      buyerRoom,
      'support_chat_closed',
      payload,
    );
    this.notificationGateway.sendToCustomRoom(
      merchantRoom,
      'support_chat_closed',
      payload,
    );
  }

  async getOrderChatHistory(orderId: string, user: User) {
    const order = await this.orderRepository.findOne({
      where: { id: orderId },
      relations: ['store', 'store.owner', 'store.company', 'store.company.owner', 'user'],
    });

    if (!order) {
      throw new NotFoundException(`Orden ${orderId} no encontrada`);
    }

    const isAdmin = user.role === UserRole.ADMIN;
    const isCustomer = order.user?.id === user.id;
    const isStoreOwner =
      order.store?.owner?.id === user.id ||
      order.store?.company?.owner?.id === user.id;

    let isAuthorizedCollaborator = false;
    if (!isAdmin && !isCustomer && !isStoreOwner) {
      const collab = await this.checkCollaboratorOrderAccess(
        user.id,
        order.store?.id,
        order.store?.company?.id,
        ['orders:chat'],
      );
      isAuthorizedCollaborator = Boolean(collab);
    }

    if (!isAdmin && !isCustomer && !isStoreOwner && !isAuthorizedCollaborator) {
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
      body: 'El equipo de soporte ha levantado la suspensión de tu acceso al chat de órdenes. Recuerda mantener una comunicación respetuosa.',
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
    this.notificationGateway.sendToStore(
      storeId,
      'store_installments_updated',
      {
        storeId,
        timestamp: new Date().toISOString(),
        ...data,
      },
    );
  }

  notifyOrderUpdated(orderId: string, data?: any) {
    if (!orderId) return;
    this.notificationGateway.sendToOrderRoom(orderId, 'order_updated', {
      orderId,
      timestamp: new Date().toISOString(),
      ...data,
    });
    if (data?.storeId) {
      this.notificationGateway.sendToStore(data.storeId, 'order_updated', {
        orderId,
        timestamp: new Date().toISOString(),
        ...data,
      });
    }
    if (data?.userId) {
      this.notificationGateway.sendToUser(data.userId, 'order_updated', {
        orderId,
        timestamp: new Date().toISOString(),
        ...data,
      });
    }
  }

  notifyDisputeUpdated(dispute: any, extraData?: any) {
    if (!dispute) return;
    const orderId = dispute.orderId || dispute.order?.id;
    const payload = {
      disputeId: dispute.id,
      orderId,
      status: dispute.status,
      resolution: dispute.resolution,
      timestamp: new Date().toISOString(),
      ...extraData,
    };

    if (orderId) {
      this.notificationGateway.sendToOrderRoom(
        orderId,
        'dispute_updated',
        payload,
      );
    }
    const storeId = dispute.order?.store?.id || extraData?.storeId;
    if (storeId) {
      this.notificationGateway.sendToStore(storeId, 'dispute_updated', payload);
    }
    const buyerId =
      dispute.requestedById ||
      dispute.requestedBy?.id ||
      dispute.order?.user?.id ||
      extraData?.userId;
    if (buyerId) {
      this.notificationGateway.sendToUser(buyerId, 'dispute_updated', payload);
    }
    const storeOwnerId =
      dispute.order?.store?.owner?.id ||
      dispute.order?.store?.company?.owner?.id ||
      extraData?.storeOwnerId;
    if (storeOwnerId && storeOwnerId !== buyerId) {
      this.notificationGateway.sendToUser(
        storeOwnerId,
        'dispute_updated',
        payload,
      );
    }
  }

  async registerDevice(userId: string, dto: RegisterDeviceDto) {
    try {
      // Si este mismo dispositivo físico o token FCM estaba asociado a otro usuario/colaborador previo en este teléfono, limpiarlo
      await this.userDeviceRepository
        .createQueryBuilder()
        .delete()
        .where('(deviceId = :deviceId OR fcmToken = :fcmToken) AND userId != :userId', {
          deviceId: dto.deviceId,
          fcmToken: dto.fcmToken,
          userId,
        })
        .execute();

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
        `Registered device ${dto.deviceId} for actor ${userId} (${dto.platform || 'android'})`,
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
      this.logger.log(`Unregistered device ${dto.deviceId} for actor ${userId}`);
      return { success: true };
    } catch (error) {
      this.logger.error(`Failed to unregister device: ${error.message}`);
      throw error;
    }
  }

  private async sendPushNotificationToUsers(
    userIds: string[],
    payload: {
      notificationId: string;
      title: string;
      body: string;
      type: string;
      orderId?: string;
      targetId?: string;
      storeId?: string;
      channelType?: string;
    },
  ) {
    if (!this.firebaseApp) return;
    const uniqueUserIds = Array.from(new Set(userIds.filter(Boolean)));
    if (uniqueUserIds.length === 0) return;

    try {
      const devices = await this.userDeviceRepository.find({
        where: { userId: In(uniqueUserIds) },
      });

      if (!devices || devices.length === 0) return;

      const tokens = Array.from(
        new Set(devices.map((d) => d.fcmToken).filter(Boolean)),
      );
      if (tokens.length === 0) return;

      const response = await getMessaging(
        this.firebaseApp,
      ).sendEachForMulticast({
        tokens,
        notification: {
          title: payload.title,
          body: payload.body,
        },
        data: {
          notificationId: payload.notificationId,
          type: payload.type,
          channelType: payload.channelType || '',
          storeId: payload.storeId || '',
          orderId: payload.orderId || '',
          targetId: payload.targetId || payload.orderId || '',
          mediationId:
            payload.type === NotificationType.MEDIATION_REQUEST &&
            !payload.orderId
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
        this.logger.log(
          `Removing ${tokensToDelete.length} obsolete FCM tokens for recipients [${uniqueUserIds.join(', ')}]`,
        );
        await this.userDeviceRepository
          .createQueryBuilder()
          .delete()
          .where('fcmToken IN (:...tokensToDelete)', { tokensToDelete })
          .execute();
      }
    } catch (error) {
      this.logger.error(
        `Error sending push notification to users [${uniqueUserIds.join(', ')}]: ${error.message}`,
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
    channelType?: string;
  }) {
    try {
      let notification: Notification;
      const targetId = data.targetId || data.orderId;

      // Resolver storeId y verificar si el destinatario (data.userId) es el comercio (dueño de tienda/empresa)
      let candidateStoreId = data.storeId;
      let isMerchantStoreNotification = false;

      if (candidateStoreId) {
        const store = await this.storeRepository
          .findOne({
            where: { id: candidateStoreId },
            relations: ['owner', 'company', 'company.owner'],
          })
          .catch(() => null);
        if (store) {
          const ownerId = store.owner?.id || store.company?.owner?.id;
          if (ownerId && ownerId === data.userId) {
            isMerchantStoreNotification = true;
          }
        }
      } else if (targetId) {
        const order = await this.orderRepository
          .findOne({
            where: { id: targetId },
            relations: ['store', 'store.owner', 'store.company', 'store.company.owner'],
          })
          .catch(() => null);
        if (order?.store?.id) {
          const ownerId =
            order.store.owner?.id || order.store.company?.owner?.id;
          if (ownerId && ownerId === data.userId) {
            candidateStoreId = order.store.id;
            isMerchantStoreNotification = true;
          }
        }
      }

      const persistedStoreId = isMerchantStoreNotification
        ? candidateStoreId
        : undefined;

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
          if (persistedStoreId) {
            notification.storeId = persistedStoreId;
          }
          if (data.channelType) {
            notification.channelType = data.channelType;
          }
        } else {
          notification = this.notificationRepository.create({
            userId: data.userId,
            title: data.title,
            body: data.body,
            type: data.type,
            targetId,
            storeId: persistedStoreId,
            channelType: data.channelType,
          });
        }
      } else {
        notification = this.notificationRepository.create({
          ...data,
          storeId: persistedStoreId,
          channelType: data.channelType,
        });
      }

      const savedNotification =
        await this.notificationRepository.save(notification);

      // Resolver colaboradores autorizados si es una notificación dirigida al comercio
      const authorizedCollaboratorIds =
        isMerchantStoreNotification && persistedStoreId
          ? await this.getAuthorizedCollaboratorsForStoreNotification(
              persistedStoreId,
              {
                type: data.type,
                channelType: data.channelType,
                title: data.title,
                body: data.body,
              },
            )
          : [];

      // 1. Emitir por WebSocket al destinatario principal y a cada colaborador autorizado
      this.notificationGateway.sendToUser(
        data.userId,
        'new_notification',
        savedNotification,
      );
      for (const collabId of authorizedCollaboratorIds) {
        this.notificationGateway.sendToUser(
          collabId,
          'new_notification',
          savedNotification,
        );
      }

      // 2. Enviar Push FCM tanto al destinatario principal como a los colaboradores autorizados
      const isStoreMediation =
        (data.type === NotificationType.MEDIATION_RESPONSE ||
          data.type === NotificationType.MEDIATION_REQUEST) &&
        (Boolean(persistedStoreId) ||
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
          data.type === NotificationType.REFUND_REPORTED ||
          data.type === NotificationType.REFUND_CONFIRMED ||
          data.type === NotificationType.CHAT_MESSAGE ||
          data.type === NotificationType.MEDIATION_RESPONSE ||
          data.type === NotificationType.ORDER_REVIEW_PROMPT ||
          data.type === NotificationType.BUYER_REVIEW_PROMPT ||
          data.type === NotificationType.ORDER_REVIEW_RECEIVED ||
          data.type === NotificationType.ORDER_REVIEW_REPLIED ||
          data.type === NotificationType.BUYER_REVIEW_RECEIVED ||
          Boolean(data.orderId));

      await this.sendPushNotificationToUsers(
        [data.userId, ...authorizedCollaboratorIds],
        {
          notificationId: savedNotification.id,
          title: data.title,
          body: data.body,
          type: data.type,
          channelType: data.channelType,
          orderId:
            data.orderId ||
            (isOrderRelated && data.type !== NotificationType.MEDIATION_REQUEST
              ? targetId
              : ''),
          targetId: targetId || '',
          storeId:
            persistedStoreId ||
            data.storeId ||
            (isStoreMediation ? targetId : ''),
        },
      );

      // 3. Si corresponde a una sucursal, notificar actualización de cuotas en tiempo real
      if (persistedStoreId || data.storeId) {
        this.notifyStoreInstallmentsUpdated(
          (persistedStoreId || data.storeId) as string,
          {
            orderId: targetId,
            type: data.type,
          },
        );
      }

      return savedNotification;
    } catch (error) {
      this.logger.error(`Failed to create notification: ${error.message}`);
      // We don't throw here to avoid breaking the caller's transaction if notifications fail
    }
  }

  /**
   * Resuelve las sucursales permitidas y permisos vigentes de un colaborador.
   */
  private async resolveCollaboratorContext(actor: any): Promise<{
    allowedStoreIds: string[];
    permissions: string[];
  }> {
    const collaborator = await this.collaboratorRepository.findOne({
      where: { id: actor.id, isActive: true },
      relations: ['company', 'role', 'role.permissions', 'stores'],
    });

    if (!collaborator || !collaborator.company?.id) {
      return { allowedStoreIds: [], permissions: [] };
    }

    const permissions = (collaborator.role?.permissions || []).map(
      (p) => p.permission,
    );

    let allowedStoreIds: string[] = [];
    if (collaborator.hasFullBranchAccess) {
      const companyStores = await this.storeRepository.find({
        where: { company: { id: collaborator.company.id } },
        select: ['id'],
      });
      allowedStoreIds = companyStores.map((s) => s.id);
    } else {
      allowedStoreIds = (collaborator.stores || []).map((s) => s.id);
    }

    return { allowedStoreIds, permissions };
  }

  async getUnreadDisputeOrderIdsForActor(actor: any): Promise<string[]> {
    if (actor?.isCollaborator || actor?.actorType === 'COLLABORATOR') {
      const { allowedStoreIds, permissions } =
        await this.resolveCollaboratorContext(actor);
      const canSeeDisputes =
        permissions.includes('disputes:view') ||
        permissions.includes('disputes:respond');
      if (!canSeeDisputes || allowedStoreIds.length === 0) {
        return [];
      }

      const notifications = await this.notificationRepository.find({
        where: [
          {
            storeId: In(allowedStoreIds),
            isRead: false,
            type: NotificationType.MEDIATION_RESPONSE,
          },
          {
            storeId: In(allowedStoreIds),
            isRead: false,
            type: NotificationType.MEDIATION_REQUEST,
          },
          {
            storeId: In(allowedStoreIds),
            isRead: false,
            type: NotificationType.DISPUTE_ESCALATED,
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

    return this.getUnreadDisputeOrderIds(actor.id);
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
        {
          userId,
          isRead: false,
          type: NotificationType.DISPUTE_ESCALATED,
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

  async markDisputeNotificationsAsReadForActor(
    actor: any,
    orderId: string,
  ): Promise<void> {
    if (actor?.isCollaborator || actor?.actorType === 'COLLABORATOR') {
      const { allowedStoreIds, permissions } =
        await this.resolveCollaboratorContext(actor);
      const canSeeDisputes =
        permissions.includes('disputes:view') ||
        permissions.includes('disputes:respond');
      if (!canSeeDisputes || allowedStoreIds.length === 0) return;

      await this.notificationRepository
        .createQueryBuilder()
        .update(Notification)
        .set({ isRead: true })
        .where('storeId IN (:...allowedStoreIds)', { allowedStoreIds })
        .andWhere('targetId = :orderId', { orderId })
        .andWhere('type IN (:...types)', {
          types: [
            NotificationType.MEDIATION_RESPONSE,
            NotificationType.MEDIATION_REQUEST,
            NotificationType.DISPUTE_ESCALATED,
          ],
        })
        .execute();
      return;
    }

    return this.markDisputeNotificationsAsRead(actor.id, orderId);
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
          NotificationType.DISPUTE_ESCALATED,
        ],
      })
      .execute();
  }

  async findAllForActor(actor: any) {
    if (actor?.isCollaborator || actor?.actorType === 'COLLABORATOR') {
      const { allowedStoreIds, permissions } =
        await this.resolveCollaboratorContext(actor);
      if (allowedStoreIds.length === 0 || permissions.length === 0) {
        return [];
      }

      const branchNotifications = await this.notificationRepository.find({
        where: { storeId: In(allowedStoreIds) },
        order: { createdAt: 'DESC' },
        take: 150,
      });

      return branchNotifications
        .filter((n) => this.canCollaboratorReceiveNotification(permissions, n))
        .slice(0, 50);
    }

    return this.findAllByUser(actor.id);
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
    channelType: ChatChannelType = ChatChannelType.DIRECT,
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

    let sender = await this.chatMessageRepository.manager.findOne(User, {
      where: { id: senderId },
    });

    // Si quien envía el mensaje es un colaborador de la tienda, usar el User propietario de la tienda/empresa como remitente en chat_messages
    if (!sender) {
      sender = order.store?.owner || order.store?.company?.owner || null;
    }

    const message = this.chatMessageRepository.create({
      order,
      sender: sender || ({ id: senderId } as User),
      content: content || (imageUrl ? '📷 Imagen adjunta' : ''),
      imageUrl,
      channelType,
    });

    const savedMessage = await this.chatMessageRepository.save(message);

    // Emitir a la sala correspondiente (DTO sanitizado)
    const messageDto = this.toChatMessageDto(savedMessage, orderId);

    if (channelType === ChatChannelType.DIRECT) {
      this.notificationGateway.sendToOrderRoom(
        orderId,
        'new_chat_message',
        messageDto,
      );

      // Notificar al destinatario si no está en la sala (direct buyer <-> store)
      const isFromBuyer = senderId === order.user.id;
      const recipientId = isFromBuyer
        ? order.store.owner?.id || order.store.company?.owner?.id
        : order.user.id;

      if (recipientId) {
        const isToBusiness = isFromBuyer;
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
          storeId: isToBusiness ? order.store?.id : undefined,
          title,
          body,
          type: NotificationType.CHAT_MESSAGE,
          targetId: orderId,
          orderId,
          channelType,
        });

        const chatNotifPayload = {
          orderId,
          senderName: isToBusiness ? senderName : order.store.name,
          content:
            content.substring(0, 50) + (content.length > 50 ? '...' : ''),
        };

        this.notificationGateway.sendToUser(
          recipientId,
          'chat_notification',
          chatNotifPayload,
        );

        if (isToBusiness && order.store?.id) {
          const authorizedChatCollabIds =
            await this.getAuthorizedCollaboratorsForStoreNotification(
              order.store.id,
              {
                type: NotificationType.CHAT_MESSAGE,
                channelType: ChatChannelType.DIRECT,
                title,
                body,
              },
            );
          for (const collabId of authorizedChatCollabIds) {
            this.notificationGateway.sendToUser(
              collabId,
              'chat_notification',
              chatNotifPayload,
            );
          }
        }
      }
    } else {
      // CANAL DE SOPORTE / MEDIACIÓN
      const room =
        channelType === ChatChannelType.DISPUTE_BUYER_SUPPORT
          ? `order_support_chat_${orderId}_buyer`
          : `order_support_chat_${orderId}_merchant`;

      this.notificationGateway.sendToCustomRoom(
        room,
        'new_support_chat_message',
        messageDto,
      );

      const senderUser = await this.userRepository.findOne({
        where: { id: senderId },
      });
      const isAdmin =
        senderUser?.role === UserRole.ADMIN ||
        (senderUser as any)?.role === 'ADMIN';

      const shortOrderId = orderId.substring(0, 8).toUpperCase();

      if (!isAdmin) {
        // El emisor es el cliente o la tienda -> notificar al panel de administración
        const roleLabel =
          channelType === ChatChannelType.DISPUTE_BUYER_SUPPORT
            ? 'cliente'
            : 'tienda';

        this.notificationGateway
          .emitAdminActionRequired({
            id: `support_msg_${savedMessage.id}`,
            type: 'DISPUTE_ESCALATED',
            title: `Nuevo mensaje de mediación (${roleLabel})`,
            message: `El ${roleLabel} ha enviado un mensaje en la orden #${shortOrderId}: "${content.substring(0, 60)}"`,
            entityId: orderId,
            link: `/disputes?orderId=${orderId}`,
            createdAt: new Date().toISOString(),
            metadata: { orderId, channelType, messageId: savedMessage.id },
          })
          .catch(() => {});
      } else {
        // El emisor es el Administrador -> notificar ÚNICAMENTE a la parte de este canal
        const isToMerchantSupport =
          channelType === ChatChannelType.DISPUTE_MERCHANT_SUPPORT;
        const recipientId =
          channelType === ChatChannelType.DISPUTE_BUYER_SUPPORT
            ? order.user.id
            : order.store?.owner?.id || order.store?.company?.owner?.id;

        if (recipientId) {
          await this.create({
            userId: recipientId,
            storeId: isToMerchantSupport ? order.store?.id : undefined,
            title: 'Soporte Tu Lojita',
            body: `Mensaje de soporte sobre tu caso en la orden #${shortOrderId}: ${content.substring(0, 80)}`,
            type: NotificationType.CHAT_MESSAGE,
            targetId: orderId,
            orderId,
            channelType,
          });

          const supportChatPayload = {
            orderId,
            channelType,
            senderName: 'Soporte Tu Lojita',
            content:
              content.substring(0, 50) + (content.length > 50 ? '...' : ''),
          };

          this.notificationGateway.sendToUser(
            recipientId,
            'support_chat_notification',
            supportChatPayload,
          );

          if (isToMerchantSupport && order.store?.id) {
            const authorizedSupportCollabIds =
              await this.getAuthorizedCollaboratorsForStoreNotification(
                order.store.id,
                {
                  type: NotificationType.CHAT_MESSAGE,
                  channelType,
                  title: 'Soporte Tu Lojita',
                  body: '',
                },
              );
            for (const collabId of authorizedSupportCollabIds) {
              this.notificationGateway.sendToUser(
                collabId,
                'support_chat_notification',
                supportChatPayload,
              );
            }
          }
        }
      }
    }

    return savedMessage;
  }

  private async resolveEffectiveChatUserId(
    orderId: string,
    actorId: string,
  ): Promise<string> {
    const userExists = await this.userRepository.exist({
      where: { id: actorId },
    });
    if (userExists) return actorId;

    const order = await this.orderRepository.findOne({
      where: { id: orderId },
      relations: ['store', 'store.owner', 'store.company', 'store.company.owner'],
    });
    return (
      order?.store?.owner?.id ||
      order?.store?.company?.owner?.id ||
      actorId
    );
  }

  async markMessagesRead(
    orderId: string,
    readerId: string,
    channelType: ChatChannelType = ChatChannelType.DIRECT,
  ) {
    const effectiveReaderId = await this.resolveEffectiveChatUserId(
      orderId,
      readerId,
    );
    const updateResult = await this.chatMessageRepository.update(
      {
        order: { id: orderId },
        channelType,
        isRead: false,
        sender: { id: Not(effectiveReaderId) },
      },
      { isRead: true, isDelivered: true },
    );

    if (updateResult.affected && updateResult.affected > 0) {
      if (channelType === ChatChannelType.DIRECT) {
        this.notificationGateway.sendToOrderRoom(orderId, 'messages_read', {
          orderId,
          readBy: effectiveReaderId,
          timestamp: new Date().toISOString(),
        });
      } else {
        const room =
          channelType === ChatChannelType.DISPUTE_BUYER_SUPPORT
            ? `order_support_chat_${orderId}_buyer`
            : `order_support_chat_${orderId}_merchant`;
        this.notificationGateway.sendToCustomRoom(
          room,
          'support_messages_read',
          {
            orderId,
            channelType,
            readBy: effectiveReaderId,
            timestamp: new Date().toISOString(),
          },
        );
      }
    }
  }

  async markMessagesDelivered(
    orderId: string,
    recipientId: string,
    channelType: ChatChannelType = ChatChannelType.DIRECT,
  ) {
    const effectiveRecipientId = await this.resolveEffectiveChatUserId(
      orderId,
      recipientId,
    );
    const updateResult = await this.chatMessageRepository.update(
      {
        order: { id: orderId },
        channelType,
        isDelivered: false,
        sender: { id: Not(effectiveRecipientId) },
      },
      { isDelivered: true },
    );

    if (updateResult.affected && updateResult.affected > 0) {
      if (channelType === ChatChannelType.DIRECT) {
        this.notificationGateway.sendToOrderRoom(
          orderId,
          'messages_delivered',
          {
            orderId,
            deliveredTo: effectiveRecipientId,
          },
        );
      } else {
        const room =
          channelType === ChatChannelType.DISPUTE_BUYER_SUPPORT
            ? `order_support_chat_${orderId}_buyer`
            : `order_support_chat_${orderId}_merchant`;
        this.notificationGateway.sendToCustomRoom(
          room,
          'support_messages_delivered',
          {
            orderId,
            channelType,
            deliveredTo: effectiveRecipientId,
          },
        );
      }
    }
  }

  async getChatHistory(
    orderId: string,
    channelType: ChatChannelType = ChatChannelType.DIRECT,
  ) {
    const messages = await this.chatMessageRepository.find({
      where: { order: { id: orderId }, channelType },
      relations: ['sender'],
      order: { createdAt: 'ASC' },
      take: 100,
    });
    return messages.map((m) => this.toChatMessageDto(m, orderId));
  }

  async getChatMessageById(messageId: string): Promise<ChatMessage | null> {
    return this.chatMessageRepository.findOne({
      where: { id: messageId },
      relations: ['order', 'sender'],
    });
  }
}
