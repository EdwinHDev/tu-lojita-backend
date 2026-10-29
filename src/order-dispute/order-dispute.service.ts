import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { OrderDispute } from './entities/order-dispute.entity';
import {
  Order,
  CancellationResolutionStatus,
} from 'src/order/entities/order.entity';
import { User } from 'src/user/entities/user.entity';
import { UserRole } from 'src/user/types';
import { OrderStatus } from 'src/order/types';
import { PaymentStatus } from 'src/payment/types/payment-status.enum';
import {
  CreateDisputeDto,
  RespondDisputeDto,
  ResolveDisputeDto,
  QueryDisputeDto,
  ForwardEvidenceDto,
} from './dto';
import {
  DisputeStatus,
  DisputeResolution,
  DisputeType,
  DisputeVerdict,
  DisputePenaltyType,
} from './types';
import { ChatChannelType } from '../notification/entities/chat-message.entity';
import { NotificationService } from '../notification/notification.service';
import { NotificationType } from '../notification/entities/notification.entity';
import { MailService } from '../common/mail/mail.service';
import { RankingService } from '../ranking/services/ranking.service';
import { RankingEventType } from '../ranking/types';
import { Store } from 'src/store/entities/store.entity';
import { StoreStrike } from 'src/store/entities/store-strike.entity';
import { StoreStatus } from 'src/store/types/status.enum';

@Injectable()
export class OrderDisputeService {
  private readonly logger = new Logger('OrderDisputeService');

  constructor(
    @InjectRepository(OrderDispute)
    private readonly disputeRepository: Repository<OrderDispute>,
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    private readonly notificationService: NotificationService,
    private readonly mailService: MailService,
    private readonly rankingService: RankingService,
    @InjectRepository(User)
    private readonly userRepository?: Repository<User>,
    @InjectRepository(Store)
    private readonly storeRepository?: Repository<Store>,
    @InjectRepository(StoreStrike)
    private readonly storeStrikeRepository?: Repository<StoreStrike>,
  ) {}

  async create(dto: CreateDisputeDto, requestingUser: User) {
    const order = await this.orderRepository.findOne({
      where: { id: dto.orderId },
      relations: ['user', 'store', 'store.owner', 'orderItems', 'payments'],
    });

    if (!order) {
      throw new NotFoundException(
        `La orden #${dto.orderId} no fue encontrada.`,
      );
    }

    if (order.status === OrderStatus.CANCELLED) {
      const hasPayments = order.payments && order.payments.length > 0;
      if (!hasPayments) {
        throw new BadRequestException(
          'No se puede abrir un reclamo o disputa sobre una orden cancelada sin pagos asociados.',
        );
      }
      if (
        dto.type !== DisputeType.REFUND &&
        dto.type !== DisputeType.REFUND_REQUEST &&
        dto.type !== DisputeType.OTHER
      ) {
        throw new BadRequestException(
          'En órdenes canceladas con pagos, el reclamo debe ser por reembolso o desacuerdo con la tienda.',
        );
      }
    }

    // Validar autorización: comprador, comercio o admin
    const isBuyer = order.user?.id === requestingUser.id;
    const isStoreOwner = order.store?.owner?.id === requestingUser.id;
    const isAdmin = requestingUser.role === UserRole.ADMIN;

    if (!isBuyer && !isStoreOwner && !isAdmin) {
      throw new ForbiddenException(
        'No tienes permisos para abrir una disputa sobre esta orden.',
      );
    }

    // Validar que no exista disputa activa concurrente
    const activeDispute = await this.disputeRepository.findOne({
      where: {
        orderId: dto.orderId,
        status: In([
          DisputeStatus.OPEN,
          DisputeStatus.MERCHANT_RESPONDED,
          DisputeStatus.ADMIN_REVIEW,
        ]),
      },
    });

    if (activeDispute) {
      throw new BadRequestException(
        'Ya existe una disputa activa en proceso de mediación para esta orden.',
      );
    }

    const finalDescription = (dto.description || dto.reason || '').trim();
    if (finalDescription.length < 10) {
      throw new BadRequestException(
        'La descripción del reclamo debe tener al menos 10 caracteres.',
      );
    }

    const hasRejectedPayment = order.payments?.some(
      (p) => p.status === PaymentStatus.REJECTED,
    );
    const isCancelledOrder = order.status === OrderStatus.CANCELLED;
    const isRefundDisputeType =
      dto.type === DisputeType.REFUND ||
      dto.type === DisputeType.REFUND_REQUEST ||
      dto.type === DisputeType.OTHER;

    const startsInAdminReview =
      isCancelledOrder && hasRejectedPayment && isRefundDisputeType;

    const initialStatus = startsInAdminReview
      ? DisputeStatus.ADMIN_REVIEW
      : DisputeStatus.OPEN;

    const dispute = this.disputeRepository.create({
      orderId: dto.orderId,
      requestedById: requestingUser.id,
      type: dto.type,
      status: initialStatus,
      description: finalDescription,
      evidenceUrls: dto.evidenceUrls || [],
    });

    const savedDispute = await this.disputeRepository.save(dispute);
    this.notificationService.notifyAdminBadgesChanged().catch(() => {});
    this.logger.log(
      `Disputa creada (${savedDispute.id}) para orden ${dto.orderId} por usuario ${requestingUser.id} con estado ${initialStatus}`,
    );

    // Hook Ranking: penalización al comercio al abrirse una disputa por parte del cliente
    if (isBuyer && order.store?.id) {
      try {
        await this.rankingService.processEvent(
          order.store.id,
          RankingEventType.DISPUTE_OPENED,
          savedDispute.id,
          requestingUser.id,
        );
      } catch (rankErr) {
        this.logger.error(
          `Error processing ranking dispute opened event: ${rankErr.message}`,
        );
      }
    }

    if (startsInAdminReview) {
      // Directo a revisión del administrador con comprobante
      await this.notifyDisputeEscalatedToAdmin(
        savedDispute,
        isBuyer ? 'BUYER' : 'MERCHANT',
        order,
      );
    } else {
      const storeOwnerId = order.store?.owner?.id;
      if (storeOwnerId) {
        try {
          const firstItem = order.orderItems?.[0]?.title;
          const itemInfo = firstItem ? ` (${firstItem})` : '';
          await this.notificationService.create({
            userId: storeOwnerId,
            storeId: order.store?.id,
            title: 'Nuevo reclamo recibido',
            body: `Un cliente ha reportado un problema con el pedido${itemInfo}: "${finalDescription.substring(0, 80)}${finalDescription.length > 80 ? '...' : ''}".`,
            type: NotificationType.MEDIATION_REQUEST,
            targetId: order.id,
          });
        } catch (err) {
          this.logger.error(
            `Error enviando notificación de reclamo al comercio: ${err.message}`,
          );
        }

        // Enviar correo transaccional de alerta al dueño del comercio
        const storeOwnerEmail = order.store?.owner?.email;
        if (storeOwnerEmail) {
          const storeOwnerName = order.store?.owner?.firstName
            ? `${order.store.owner.firstName} ${order.store.owner.lastName || ''}`.trim()
            : order.store?.name || 'Comercio';

          this.mailService
            .sendDisputeOpenedToStore({
              toEmail: storeOwnerEmail,
              storeOwnerName,
              storeName: order.store?.name || 'Tu Tienda',
              orderId: order.id,
              customerName:
                `${order.user?.firstName || 'Cliente'} ${order.user?.lastName || ''}`.trim(),
              disputeType: dto.type,
              description: finalDescription,
              totalAmount: order.totalAmount,
            })
            .catch((err) => {
              this.logger.error(
                `Error enviando correo de reclamo al comercio: ${err.message}`,
              );
            });
        }
      }
    }

    this.notificationService.notifyDisputeUpdated(savedDispute, {
      storeId: order.store?.id,
      userId: requestingUser.id,
      storeOwnerId: order.store?.owner?.id,
    });

    return savedDispute;
  }

  private async notifyDisputeEscalatedToAdmin(
    dispute: OrderDispute,
    escalatedByRole: 'BUYER' | 'MERCHANT',
    order?: Order,
  ) {
    const effectiveOrder = order || dispute.order;
    const effectiveOrderId = effectiveOrder?.id || dispute.orderId;
    const shortOrderId = (effectiveOrderId || dispute.id)
      .slice(0, 8)
      .toUpperCase();

    // 1. Notificar al panel de administración para arbitraje
    this.notificationService
      .notifyAdminActionRequired({
        type: 'DISPUTE_ESCALATED',
        title: 'Disputa de pedido en mediación',
        message: `La disputa de la orden #${shortOrderId} fue escalada para arbitraje del administrador`,
        entityId: dispute.id,
        link: '/disputes',
        metadata: {
          disputeId: dispute.id,
          orderId: effectiveOrderId,
          type: dispute.type,
        },
      })
      .catch(() => {});

    // 2. Notificaciones a los involucrados con NotificationType.DISPUTE_ESCALATED
    try {
      const buyerId = effectiveOrder?.user?.id || dispute.requestedById;
      const storeOwnerId =
        effectiveOrder?.store?.owner?.id ||
        effectiveOrder?.store?.company?.owner?.id;
      const storeId = effectiveOrder?.store?.id;

      if (escalatedByRole === 'BUYER') {
        if (storeOwnerId) {
          await this.notificationService.create({
            userId: storeOwnerId,
            storeId,
            title: 'Disputa en mediación con Soporte',
            body: `El cliente ha escalado el caso de la orden #${shortOrderId} a mediación con el equipo de soporte. El caso está en proceso de revisión y el equipo de soporte podría ponerse en contacto contigo.`,
            type: NotificationType.DISPUTE_ESCALATED,
            targetId: effectiveOrderId,
            orderId: effectiveOrderId,
          });
        }
      } else {
        if (buyerId) {
          await this.notificationService.create({
            userId: buyerId,
            title: 'Reclamo escalado a soporte',
            body: `La tienda ha escalado el caso de la orden #${shortOrderId} al equipo de soporte para mediación arbitral.`,
            type: NotificationType.DISPUTE_ESCALATED,
            targetId: effectiveOrderId,
            orderId: effectiveOrderId,
          });
        }
      }
    } catch (err) {
      this.logger.error(
        `Error enviando notificación DISPUTE_ESCALATED: ${err.message}`,
      );
    }
  }

  async findByOrder(orderId: string, requestingUser: User) {
    const order = await this.orderRepository.findOne({
      where: { id: orderId },
      relations: ['user', 'store', 'store.owner'],
    });

    if (!order) {
      throw new NotFoundException(`La orden #${orderId} no fue encontrada.`);
    }

    const isBuyer = order.user?.id === requestingUser.id;
    const isStoreOwner = order.store?.owner?.id === requestingUser.id;
    const isAdmin = requestingUser.role === UserRole.ADMIN;

    if (!isBuyer && !isStoreOwner && !isAdmin) {
      throw new ForbiddenException(
        'No tienes permisos para consultar las disputas de esta orden.',
      );
    }

    return this.disputeRepository.find({
      where: { orderId },
      relations: ['requestedBy'],
      order: { createdAt: 'DESC' },
    });
  }

  async findAll(query: QueryDisputeDto) {
    const { status, type, orderId, limit = 20, offset = 0 } = query;

    const where: any = {};
    if (status) where.status = status;
    if (type) where.type = type;
    if (orderId) where.orderId = orderId;

    const [items, total] = await this.disputeRepository.findAndCount({
      where,
      relations: ['order', 'requestedBy', 'order.store', 'order.user'],
      order: { createdAt: 'DESC' },
      take: limit,
      skip: offset,
    });

    return {
      items,
      total,
      limit,
      offset,
    };
  }

  assertDisputeParticipant(dispute: OrderDispute, user: User) {
    if (user.role === UserRole.ADMIN) return true;
    const buyerId = dispute.order?.user?.id || dispute.requestedById;
    const storeOwnerId =
      dispute.order?.store?.owner?.id ||
      dispute.order?.store?.company?.owner?.id;

    if (user.id !== buyerId && user.id !== storeOwnerId) {
      throw new ForbiddenException(
        'No tienes permisos para acceder a esta disputa.',
      );
    }
    return true;
  }

  async findOne(id: string, requestingUser?: User) {
    const dispute = await this.disputeRepository.findOne({
      where: { id },
      relations: [
        'order',
        'requestedBy',
        'order.store',
        'order.store.owner',
        'order.store.company',
        'order.store.company.owner',
        'order.user',
      ],
    });

    if (!dispute) {
      throw new NotFoundException(`Disputa #${id} no encontrada.`);
    }

    if (requestingUser) {
      this.assertDisputeParticipant(dispute, requestingUser);
    }

    return dispute;
  }

  async respond(id: string, dto: RespondDisputeDto, requestingUser: User) {
    const dispute = await this.disputeRepository.findOne({
      where: { id },
      relations: [
        'order',
        'order.store',
        'order.store.owner',
        'order.user',
        'requestedBy',
      ],
    });

    if (!dispute) {
      throw new NotFoundException(`Disputa #${id} no encontrada.`);
    }

    const isStoreOwner = dispute.order?.store?.owner?.id === requestingUser.id;
    const isAdmin = requestingUser.role === UserRole.ADMIN;

    if (!isStoreOwner && !isAdmin) {
      throw new ForbiddenException(
        'Solo el comercio vendedor o un administrador pueden responder a este reclamo.',
      );
    }

    if (
      dispute.status === DisputeStatus.RESOLVED ||
      dispute.status === DisputeStatus.REFUNDED ||
      dispute.status === DisputeStatus.REJECTED
    ) {
      throw new BadRequestException(
        'No se puede responder a una disputa que ya fue concluida.',
      );
    }

    const responseText = (dto.merchantResponse || dto.response || '').trim();
    if (!dto.acceptDispute && responseText.length < 5) {
      throw new BadRequestException(
        'La respuesta del comercio debe tener al menos 5 caracteres.',
      );
    }

    dispute.merchantResponse =
      responseText.length > 0
        ? responseText
        : dto.acceptDispute
          ? 'Reclamo aceptado por el comercio.'
          : '';

    if (dto.evidenceUrls && dto.evidenceUrls.length > 0) {
      dispute.merchantEvidenceUrls = dto.evidenceUrls;
    }

    if (dto.acceptDispute) {
      dispute.status = DisputeStatus.RESOLVED;
      dispute.resolution = DisputeResolution.RESOLVED;
      dispute.resolvedAt = new Date();
      dispute.merchantMarkedResolved = true;
      dispute.merchantMarkedResolvedAt = new Date();

      if (dispute.order) {
        dispute.order.cancellationResolutionConfirmed = true;
        dispute.order.cancellationResolutionStatus =
          CancellationResolutionStatus.RESOLVED;
        dispute.order.cancellationResolvedAt = new Date();
        await this.orderRepository.save(dispute.order);
      }
    } else {
      dispute.status = DisputeStatus.MERCHANT_RESPONDED;
    }

    const updated = await this.disputeRepository.save(dispute);
    this.logger.log(`Comercio respondió a disputa ${id}`);

    const recipientUserId =
      dispute.requestedById ||
      dispute.requestedBy?.id ||
      dispute.order?.user?.id;

    if (recipientUserId) {
      const effectiveOrderId = dispute.order?.id || dispute.orderId;
      try {
        await this.notificationService.create({
          userId: recipientUserId,
          title: dto.acceptDispute
            ? 'Reclamo aceptado'
            : 'Respuesta a tu reclamo',
          body: dto.acceptDispute
            ? 'El comercio ha aceptado tu reclamo y el pedido fue marcado como resuelto.'
            : `El comercio ha respondido a tu reclamo: "${responseText.substring(0, 80)}${responseText.length > 80 ? '...' : ''}".`,
          type: NotificationType.MEDIATION_RESPONSE,
          targetId: effectiveOrderId,
          orderId: effectiveOrderId,
        });
      } catch (err) {
        this.logger.error(
          `Error enviando notificación de respuesta de reclamo al cliente: ${err.message}`,
        );
      }

      // Enviar correo transaccional de actualización al cliente
      const customerEmail =
        dispute.requestedBy?.email || dispute.order?.user?.email;
      if (customerEmail) {
        const customerName =
          `${dispute.requestedBy?.firstName || dispute.order?.user?.firstName || 'Cliente'} ${dispute.requestedBy?.lastName || dispute.order?.user?.lastName || ''}`.trim();
        this.mailService
          .sendDisputeResponseToCustomer({
            toEmail: customerEmail,
            customerName,
            storeName: dispute.order?.store?.name || 'Comercio',
            orderId: effectiveOrderId,
            merchantResponse: responseText,
            isAccepted: !!dto.acceptDispute,
          })
          .catch((err) => {
            this.logger.error(
              `Error enviando correo de respuesta de reclamo al cliente: ${err.message}`,
            );
          });
      }
    }

    this.notificationService.notifyDisputeUpdated(updated);
    return updated;
  }

  async markResolved(id: string, requestingUser: User) {
    const dispute = await this.disputeRepository.findOne({
      where: { id },
      relations: [
        'order',
        'order.store',
        'order.store.owner',
        'order.user',
        'requestedBy',
      ],
    });

    if (!dispute) {
      throw new NotFoundException(`Disputa #${id} no encontrada.`);
    }

    const isBuyer =
      dispute.order?.user?.id === requestingUser.id ||
      dispute.requestedById === requestingUser.id;
    const isStoreOwner = dispute.order?.store?.owner?.id === requestingUser.id;

    if (!isBuyer && !isStoreOwner) {
      throw new ForbiddenException(
        'Solo el comprador o el comercio pueden marcar este reclamo como resuelto.',
      );
    }

    if (dispute.status !== DisputeStatus.MERCHANT_RESPONDED) {
      throw new BadRequestException(
        isBuyer && dispute.status === DisputeStatus.OPEN
          ? 'La tienda aún no ha respondido al reclamo. Espera su respuesta antes de marcarlo como resuelto.'
          : 'Solo se puede marcar como resuelto un reclamo que esté en estado "Tienda respondió".',
      );
    }

    // Registrar el voto de quien llama
    if (isBuyer) {
      dispute.clientMarkedResolved = true;
      dispute.clientMarkedResolvedAt = new Date();
    } else {
      dispute.merchantMarkedResolved = true;
      dispute.merchantMarkedResolvedAt = new Date();
    }

    // Auto-cierre por consenso bilateral
    const bothAgreed =
      dispute.merchantMarkedResolved && dispute.clientMarkedResolved;
    if (bothAgreed) {
      dispute.status = DisputeStatus.RESOLVED;
      dispute.resolution = DisputeResolution.RESOLVED;
      dispute.resolvedAt = new Date();

      if (dispute.order) {
        dispute.order.cancellationResolutionConfirmed = true;
        dispute.order.cancellationResolutionStatus =
          CancellationResolutionStatus.RESOLVED;
        dispute.order.cancellationResolvedAt = new Date();
        await this.orderRepository.save(dispute.order);
      }
    }

    const updated = await this.disputeRepository.save(dispute);
    this.notificationService.notifyAdminBadgesChanged().catch(() => {});
    this.logger.log(
      `Usuario ${requestingUser.id} marcó disputa ${id} como resuelta. Consenso: ${bothAgreed}`,
    );

    if (bothAgreed && dispute.order?.store?.id) {
      try {
        await this.rankingService.processEvent(
          dispute.order.store.id,
          RankingEventType.DISPUTE_WON,
          dispute.id,
        );
      } catch (rankErr) {
        this.logger.error(
          `Error processing ranking dispute won event: ${rankErr.message}`,
        );
      }
    }

    // Notificaciones
    try {
      const effectiveOrderId = dispute.order?.id || dispute.orderId;
      const buyerId =
        dispute.requestedById ||
        dispute.requestedBy?.id ||
        dispute.order?.user?.id;
      const storeOwnerId = dispute.order?.store?.owner?.id;

      if (bothAgreed) {
        // Notificar a ambas partes que el reclamo se cerró por consenso
        if (buyerId) {
          await this.notificationService.create({
            userId: buyerId,
            title: 'Reclamo resuelto por acuerdo mutuo',
            body: 'Tu reclamo fue cerrado satisfactoriamente. Ambas partes confirmaron la resolución.',
            type: NotificationType.MEDIATION_RESPONSE,
            targetId: effectiveOrderId,
            orderId: effectiveOrderId,
          });
        }
        if (storeOwnerId) {
          await this.notificationService.create({
            userId: storeOwnerId,
            storeId: dispute.order?.store?.id,
            title: 'Reclamo resuelto por acuerdo mutuo',
            body: 'El reclamo fue cerrado satisfactoriamente. Ambas partes confirmaron la resolución.',
            type: NotificationType.MEDIATION_RESPONSE,
            targetId: effectiveOrderId,
            orderId: effectiveOrderId,
          });
        }
      } else if (isBuyer) {
        // Avisar a la tienda que el cliente votó
        if (storeOwnerId) {
          await this.notificationService.create({
            userId: storeOwnerId,
            storeId: dispute.order?.store?.id,
            title: 'El cliente marcó el reclamo como resuelto',
            body: 'El cliente indica que el problema fue resuelto. Confirma para cerrar el reclamo.',
            type: NotificationType.MEDIATION_RESPONSE,
            targetId: effectiveOrderId,
            orderId: effectiveOrderId,
          });
        }
      } else {
        // Avisar al cliente que la tienda votó
        if (buyerId) {
          await this.notificationService.create({
            userId: buyerId,
            title: 'La tienda marcó el reclamo como resuelto',
            body: 'La tienda indica que el problema fue resuelto. Confirma para cerrar el reclamo.',
            type: NotificationType.MEDIATION_RESPONSE,
            targetId: effectiveOrderId,
            orderId: effectiveOrderId,
          });
        }
      }
    } catch (err) {
      this.logger.error(
        `Error enviando notificación de mark-resolved: ${err.message}`,
      );
    }

    this.notificationService.notifyDisputeUpdated(updated);
    return updated;
  }

  async escalate(id: string, requestingUser: User) {
    const dispute = await this.disputeRepository.findOne({
      where: { id },
      relations: ['order', 'order.store', 'order.store.owner', 'order.user'],
    });

    if (!dispute) {
      throw new NotFoundException(`Disputa #${id} no encontrada.`);
    }

    const isBuyer = dispute.order?.user?.id === requestingUser.id;
    const isStoreOwner = dispute.order?.store?.owner?.id === requestingUser.id;

    if (!isBuyer && !isStoreOwner) {
      throw new ForbiddenException(
        'Solo el comprador o el comercio pueden escalar este reclamo.',
      );
    }

    const activeStatuses = [
      DisputeStatus.OPEN,
      DisputeStatus.MERCHANT_RESPONDED,
    ];
    if (!activeStatuses.includes(dispute.status)) {
      throw new BadRequestException(
        dispute.status === DisputeStatus.ADMIN_REVIEW
          ? 'Este reclamo ya está siendo revisado por el equipo de soporte.'
          : 'Este reclamo ya fue concluido y no puede escalarse.',
      );
    }

    // Resetear el voto de resolución de quien escala
    if (isBuyer) {
      dispute.clientMarkedResolved = false;
      dispute.clientMarkedResolvedAt = null;
    } else {
      dispute.merchantMarkedResolved = false;
      dispute.merchantMarkedResolvedAt = null;
    }

    dispute.status = DisputeStatus.ADMIN_REVIEW;
    const updated = await this.disputeRepository.save(dispute);
    await this.notifyDisputeEscalatedToAdmin(
      updated,
      isBuyer ? 'BUYER' : 'MERCHANT',
      dispute.order,
    );
    this.logger.log(
      `Usuario ${requestingUser.id} (${isBuyer ? 'comprador' : 'comercio'}) escaló disputa ${id} a admin`,
    );

    this.notificationService.notifyDisputeUpdated(updated);
    return updated;
  }

  async resolve(id: string, dto: ResolveDisputeDto, adminUser: User) {
    const dispute = await this.disputeRepository.findOne({
      where: { id },
      relations: [
        'order',
        'order.user',
        'order.store',
        'order.store.owner',
        'order.store.company',
        'order.store.company.owner',
      ],
    });

    if (!dispute) {
      throw new NotFoundException(`Disputa #${id} no encontrada.`);
    }

    if (
      dispute.status === DisputeStatus.RESOLVED ||
      dispute.status === DisputeStatus.REFUNDED ||
      dispute.status === DisputeStatus.REJECTED
    ) {
      throw new BadRequestException(
        'Esta disputa ya fue resuelta y cerrada previamente.',
      );
    }

    // Determinar veredicto, resolución y estado final
    let verdict = dto.verdict;
    let resolution = dto.resolution;
    let status = dto.status;

    if (verdict) {
      if (verdict === DisputeVerdict.BUYER_FAVOR) {
        resolution = resolution || DisputeResolution.REFUND;
        status = status || DisputeStatus.REFUNDED;
      } else if (verdict === DisputeVerdict.MERCHANT_FAVOR) {
        resolution = resolution || DisputeResolution.KEEP;
        status = status || DisputeStatus.RESOLVED;
      } else if (verdict === DisputeVerdict.MUTUAL_RESOLUTION) {
        resolution = resolution || DisputeResolution.PARTIAL_REFUND;
        status = status || DisputeStatus.RESOLVED;
      }
    } else {
      if (
        resolution === DisputeResolution.REFUND ||
        status === DisputeStatus.REFUNDED
      ) {
        verdict = DisputeVerdict.BUYER_FAVOR;
      } else if (status === DisputeStatus.REJECTED) {
        verdict = DisputeVerdict.MERCHANT_FAVOR;
      } else {
        verdict = DisputeVerdict.MUTUAL_RESOLUTION;
      }
    }

    const validTerminalStatuses = [
      DisputeStatus.RESOLVED,
      DisputeStatus.REFUNDED,
      DisputeStatus.REJECTED,
    ];

    if (!status || !validTerminalStatuses.includes(status)) {
      throw new BadRequestException(
        'El estado de resolución debe ser RESOLVED, REFUNDED o REJECTED.',
      );
    }

    const buyerPenalty = dto.buyerPenalty || DisputePenaltyType.NONE;
    const merchantPenalty = dto.merchantPenalty || DisputePenaltyType.NONE;

    dispute.verdict = verdict;
    dispute.resolution = resolution;
    dispute.status = status;
    dispute.buyerPenalty = buyerPenalty;
    dispute.merchantPenalty = merchantPenalty;
    dispute.resolvedByUserId = adminUser.id;
    dispute.adminNote = dto.adminNote.trim();
    dispute.resolvedAt = new Date();

    // 1. Aplicar sanciones al comprador si corresponde
    let buyerPenaltyDescription = '';
    const buyerUser = dispute.order?.user;
    if (
      this.userRepository &&
      buyerUser &&
      buyerPenalty !== DisputePenaltyType.NONE
    ) {
      const buyer = await this.userRepository.findOne({
        where: { id: buyerUser.id },
      });
      if (buyer) {
        const shortId = dispute.orderId.substring(0, 8).toUpperCase();
        if (buyerPenalty === DisputePenaltyType.STRIKE) {
          buyerPenaltyDescription =
            'Amonestación formal (Strike) registrada en tu cuenta.';
        } else if (buyerPenalty === DisputePenaltyType.SUSPEND_7_DAYS) {
          buyer.accountSuspendedUntil = new Date(
            Date.now() + 7 * 24 * 60 * 60 * 1000,
          );
          buyer.accountSuspensionReason = `Suspensión de 7 días por dictamen arbitral en orden #${shortId}`;
          buyerPenaltyDescription = 'Suspensión temporal de cuenta por 7 días.';
        } else if (buyerPenalty === DisputePenaltyType.SUSPEND_15_DAYS) {
          buyer.accountSuspendedUntil = new Date(
            Date.now() + 15 * 24 * 60 * 60 * 1000,
          );
          buyer.accountSuspensionReason = `Suspensión de 15 días por dictamen arbitral en orden #${shortId}`;
          buyerPenaltyDescription =
            'Suspensión temporal de cuenta por 15 días.';
        } else if (buyerPenalty === DisputePenaltyType.SUSPEND_30_DAYS) {
          buyer.accountSuspendedUntil = new Date(
            Date.now() + 30 * 24 * 60 * 60 * 1000,
          );
          buyer.accountSuspensionReason = `Suspensión de 30 días por dictamen arbitral en orden #${shortId}`;
          buyerPenaltyDescription =
            'Suspensión temporal de cuenta por 30 días.';
        } else if (buyerPenalty === DisputePenaltyType.BAN) {
          buyer.isActive = false;
          buyer.accountSuspensionReason = `Bloqueo permanente por dictamen arbitral en orden #${shortId}`;
          buyerPenaltyDescription = 'Bloqueo permanente de cuenta.';
        }
        await this.userRepository.save(buyer);
      }
    }

    // 2. Aplicar sanciones a la tienda si corresponde
    let merchantPenaltyDescription = '';
    const storeEntity = dispute.order?.store;
    if (
      this.storeRepository &&
      this.storeStrikeRepository &&
      storeEntity &&
      merchantPenalty !== DisputePenaltyType.NONE
    ) {
      const store = await this.storeRepository.findOne({
        where: { id: storeEntity.id },
      });
      if (store) {
        const shortId = dispute.orderId.substring(0, 8).toUpperCase();
        if (merchantPenalty === DisputePenaltyType.STRIKE) {
          const strike = this.storeStrikeRepository.create({
            store,
            reason: `Dictamen arbitral en orden #${shortId}: ${dispute.adminNote}`,
            expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
          });
          await this.storeStrikeRepository.save(strike);
          const activeStrikes = await this.storeStrikeRepository.count({
            where: { store: { id: store.id }, isRevoked: false },
          });
          store.strikes = activeStrikes;
          if (activeStrikes >= 3) {
            store.status = StoreStatus.SUSPENDED;
          }
          await this.storeRepository.save(store);
          merchantPenaltyDescription = `Amonestación con Strike aplicado (${activeStrikes}/3).`;
          this.rankingService
            .processEvent(store.id, RankingEventType.STRIKE, strike.id)
            .catch(() => {});
        } else if (
          merchantPenalty === DisputePenaltyType.SUSPEND_7_DAYS ||
          merchantPenalty === DisputePenaltyType.SUSPEND_15_DAYS ||
          merchantPenalty === DisputePenaltyType.SUSPEND_30_DAYS
        ) {
          store.status = StoreStatus.SUSPENDED;
          await this.storeRepository.save(store);
          const days =
            merchantPenalty === DisputePenaltyType.SUSPEND_7_DAYS
              ? 7
              : merchantPenalty === DisputePenaltyType.SUSPEND_15_DAYS
                ? 15
                : 30;
          merchantPenaltyDescription = `Suspensión temporal del comercio (${days} días).`;
        } else if (merchantPenalty === DisputePenaltyType.BAN) {
          store.status = StoreStatus.CLOSED;
          await this.storeRepository.save(store);
          merchantPenaltyDescription =
            'Clausura definitiva de la tienda en plataforma.';
        }
      }
    }

    if (
      status === DisputeStatus.RESOLVED ||
      status === DisputeStatus.REFUNDED
    ) {
      if (dispute.order) {
        dispute.order.cancellationResolutionConfirmed = true;
        dispute.order.cancellationResolutionStatus =
          CancellationResolutionStatus.RESOLVED;
        dispute.order.cancellationResolvedAt = new Date();
        await this.orderRepository.save(dispute.order);
      }
    }

    const saved = await this.disputeRepository.save(dispute);
    this.notificationService.notifyAdminBadgesChanged().catch(() => {});
    this.logger.log(
      `Disputa ${id} resuelta por admin ${adminUser.id} con veredicto: ${verdict}, buyerPenalty: ${buyerPenalty}, merchantPenalty: ${merchantPenalty}`,
    );

    // Hook Ranking según resultado de la resolución
    try {
      if (dispute.order?.store?.id) {
        if (
          status === DisputeStatus.REFUNDED ||
          verdict === DisputeVerdict.BUYER_FAVOR
        ) {
          await this.rankingService.processEvent(
            dispute.order.store.id,
            RankingEventType.DISPUTE_LOST,
            saved.id,
          );
        } else if (
          status === DisputeStatus.REJECTED ||
          verdict === DisputeVerdict.MERCHANT_FAVOR
        ) {
          await this.rankingService.processEvent(
            dispute.order.store.id,
            RankingEventType.DISPUTE_WON,
            saved.id,
          );
        }
      }
    } catch (rankErr) {
      this.logger.error(
        `Error processing ranking dispute resolution event: ${rankErr.message}`,
      );
    }

    // Despacho de notificaciones y correos a ambas partes
    const verdictTitle =
      verdict === DisputeVerdict.BUYER_FAVOR
        ? 'Resolución Favorable al Comprador'
        : verdict === DisputeVerdict.MERCHANT_FAVOR
          ? 'Resolución Favorable al Comercio'
          : 'Resolución de Acuerdo Mutuo';

    const verdictDescription =
      verdict === DisputeVerdict.BUYER_FAVOR
        ? 'El equipo de soporte ha fallado a favor del cliente. El comercio debe emitir o validar el reintegro de fondos correspondiente.'
        : verdict === DisputeVerdict.MERCHANT_FAVOR
          ? 'El equipo de soporte ha ratificado la validez de la orden y respaldado al comercio.'
          : 'Se ha determinado una solución compartida o mutua entre ambas partes.';

    const shortOrderId = dispute.orderId.substring(0, 8).toUpperCase();

    // Notificar al Comprador
    if (buyerUser?.id) {
      this.notificationService
        .create({
          userId: buyerUser.id,
          title: `Dictamen de Soporte: ${verdictTitle}`,
          body: `Orden #${shortOrderId}: ${dispute.adminNote.substring(0, 90)}...`,
          type: NotificationType.MEDIATION_RESPONSE,
          targetId: dispute.orderId,
        })
        .catch(() => {});

      if (buyerUser.email) {
        this.mailService
          .sendDisputeVerdictNotice({
            toEmail: buyerUser.email,
            recipientName: `${buyerUser.firstName || 'Cliente'}`,
            role: 'COMPRADOR',
            orderId: dispute.orderId,
            verdictTitle,
            verdictDescription,
            adminNotes: dispute.adminNote,
            penaltyText: buyerPenaltyDescription,
          })
          .catch(() => {});
      }
    }

    // Notificar a la Tienda
    const storeOwner =
      dispute.order?.store?.owner || dispute.order?.store?.company?.owner;
    if (storeOwner?.id) {
      this.notificationService
        .create({
          userId: storeOwner.id,
          storeId: dispute.order?.store?.id,
          title: `Dictamen de Soporte: ${verdictTitle}`,
          body: `Orden #${shortOrderId}: ${dispute.adminNote.substring(0, 90)}...`,
          type: NotificationType.MEDIATION_RESPONSE,
          targetId: dispute.orderId,
          orderId: dispute.orderId,
        })
        .catch(() => {});

      if (storeOwner.email) {
        this.mailService
          .sendDisputeVerdictNotice({
            toEmail: storeOwner.email,
            recipientName: `${storeOwner.firstName || 'Comercio'}`,
            role: 'COMERCIO',
            orderId: dispute.orderId,
            verdictTitle,
            verdictDescription,
            adminNotes: dispute.adminNote,
            penaltyText: merchantPenaltyDescription,
          })
          .catch(() => {});
      }
    }

    this.notificationService.notifyDisputeUpdated(saved);
    this.notificationService.notifySupportChatClosed(dispute.orderId, {
      orderId: dispute.orderId,
      disputeId: saved.id,
      status: saved.status,
      resolution: saved.resolution,
      verdictTitle,
      verdictDescription,
      adminNote: saved.adminNote,
      resolvedAt: new Date().toISOString(),
    });

    return {
      message: 'Dictamen arbitral emitido y notificado con éxito.',
      dispute: saved,
    };
  }

  async forwardEvidence(
    disputeId: string,
    dto: ForwardEvidenceDto,
    adminUser: User,
  ) {
    const dispute = await this.disputeRepository.findOne({
      where: { id: disputeId },
      relations: ['order', 'order.user', 'order.store', 'order.store.owner'],
    });

    if (!dispute) {
      throw new NotFoundException(
        `La disputa #${disputeId} no fue encontrada.`,
      );
    }

    const sourceMessage = await this.notificationService.getChatMessageById(
      dto.messageId,
    );
    if (!sourceMessage) {
      throw new NotFoundException(
        `El mensaje #${dto.messageId} no fue encontrado.`,
      );
    }

    if (!sourceMessage.imageUrl) {
      throw new BadRequestException(
        'El mensaje seleccionado no contiene una imagen de evidencia para reenviar.',
      );
    }

    if (sourceMessage.order?.id !== dispute.orderId) {
      throw new BadRequestException(
        'El mensaje no pertenece a la orden en disputa.',
      );
    }

    if (sourceMessage.channelType === dto.targetChannel) {
      throw new BadRequestException(
        'El canal de destino debe ser la contraparte.',
      );
    }

    const isFromBuyer =
      sourceMessage.channelType === ChatChannelType.DISPUTE_BUYER_SUPPORT;
    const originLabel = isFromBuyer
      ? 'el cliente comprador'
      : 'el comercio vendedor';
    const targetLabel =
      dto.targetChannel === ChatChannelType.DISPUTE_BUYER_SUPPORT
        ? 'comprador'
        : 'comercio';

    const forwardText = `📷 [EVIDENCIA TRASLADADA]: Evidencia aportada por ${originLabel} y admitida por el equipo de Soporte para revisión.`;

    const forwardedMessage = await this.notificationService.saveMessage(
      dispute.orderId,
      adminUser.id,
      forwardText,
      sourceMessage.imageUrl,
      dto.targetChannel,
    );

    this.logger.log(
      `Admin ${adminUser.id} reenvió evidencia ${sourceMessage.imageUrl} de ${sourceMessage.channelType} hacia ${dto.targetChannel} en disputa ${disputeId}`,
    );

    return {
      success: true,
      message: `Evidencia trasladada exitosamente al canal del ${targetLabel}.`,
      forwardedMessage,
    };
  }
}
