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
import { Order } from 'src/order/entities/order.entity';
import { User } from 'src/user/entities/user.entity';
import { UserRole } from 'src/user/types';
import { OrderStatus } from 'src/order/types';
import {
  CreateDisputeDto,
  RespondDisputeDto,
  ResolveDisputeDto,
  QueryDisputeDto,
} from './dto';
import { DisputeStatus, DisputeResolution } from './types';
import { NotificationService } from '../notification/notification.service';
import { NotificationType } from '../notification/entities/notification.entity';
import { MailService } from '../common/mail/mail.service';
import { RankingService } from '../ranking/services/ranking.service';
import { RankingEventType } from '../ranking/types';

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
  ) {}

  async create(dto: CreateDisputeDto, requestingUser: User) {
    const order = await this.orderRepository.findOne({
      where: { id: dto.orderId },
      relations: ['user', 'store', 'store.owner', 'orderItems'],
    });

    if (!order) {
      throw new NotFoundException(`La orden #${dto.orderId} no fue encontrada.`);
    }

    if (order.status === OrderStatus.CANCELLED) {
      throw new BadRequestException(
        'No se puede abrir un reclamo o disputa sobre una orden que ya está cancelada.',
      );
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

    const dispute = this.disputeRepository.create({
      orderId: dto.orderId,
      requestedById: requestingUser.id,
      type: dto.type,
      status: DisputeStatus.OPEN,
      description: finalDescription,
      evidenceUrls: dto.evidenceUrls || [],
    });

    const savedDispute = await this.disputeRepository.save(dispute);
    this.notificationService.notifyAdminBadgesChanged().catch(() => {});
    this.logger.log(
      `Disputa creada (${savedDispute.id}) para orden ${dto.orderId} por usuario ${requestingUser.id}`,
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
        this.logger.error(`Error processing ranking dispute opened event: ${rankErr.message}`);
      }
    }

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
            customerName: `${order.user?.firstName || 'Cliente'} ${order.user?.lastName || ''}`.trim(),
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

    return savedDispute;
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

  async findOne(id: string) {
    const dispute = await this.disputeRepository.findOne({
      where: { id },
      relations: ['order', 'requestedBy', 'order.store', 'order.user'],
    });

    if (!dispute) {
      throw new NotFoundException(`Disputa #${id} no encontrada.`);
    }

    return dispute;
  }

  async respond(id: string, dto: RespondDisputeDto, requestingUser: User) {
    const dispute = await this.disputeRepository.findOne({
      where: { id },
      relations: ['order', 'order.store', 'order.store.owner', 'order.user'],
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
    } else {
      dispute.status = DisputeStatus.MERCHANT_RESPONDED;
    }

    const updated = await this.disputeRepository.save(dispute);
    this.logger.log(`Comercio respondió a disputa ${id}`);

    if (dispute.order?.user?.id) {
      try {
        await this.notificationService.create({
          userId: dispute.order.user.id,
          title: dto.acceptDispute ? 'Reclamo aceptado' : 'Respuesta a tu reclamo',
          body: dto.acceptDispute
            ? 'El comercio ha aceptado tu reclamo y el pedido fue marcado como resuelto.'
            : `El comercio ha respondido a tu reclamo: "${responseText.substring(0, 80)}${responseText.length > 80 ? '...' : ''}".`,
          type: NotificationType.MEDIATION_RESPONSE,
          targetId: dispute.order.id,
        });
      } catch (err) {
        this.logger.error(
          `Error enviando notificación de respuesta de reclamo al cliente: ${err.message}`,
        );
      }

      // Enviar correo transaccional de actualización al cliente
      const customerEmail = dispute.order.user.email;
      if (customerEmail) {
        const customerName = `${dispute.order.user.firstName || 'Cliente'} ${dispute.order.user.lastName || ''}`.trim();
        this.mailService
          .sendDisputeResponseToCustomer({
            toEmail: customerEmail,
            customerName,
            storeName: dispute.order.store?.name || 'Comercio',
            orderId: dispute.order.id,
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

    return updated;
  }


  async markResolved(id: string, requestingUser: User) {
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
    const bothAgreed = dispute.merchantMarkedResolved && dispute.clientMarkedResolved;
    if (bothAgreed) {
      dispute.status = DisputeStatus.RESOLVED;
      dispute.resolution = DisputeResolution.RESOLVED;
      dispute.resolvedAt = new Date();
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
        this.logger.error(`Error processing ranking dispute won event: ${rankErr.message}`);
      }
    }

    // Notificaciones
    try {
      if (bothAgreed) {
        // Notificar a ambas partes que el reclamo se cerró por consenso
        const buyerId = dispute.order?.user?.id;
        const storeOwnerId = dispute.order?.store?.owner?.id;
        if (buyerId) {
          await this.notificationService.create({
            userId: buyerId,
            title: 'Reclamo resuelto por acuerdo mutuo',
            body: 'Tu reclamo fue cerrado satisfactoriamente. Ambas partes confirmaron la resolución.',
            type: NotificationType.MEDIATION_RESPONSE,
            targetId: dispute.order.id,
          });
        }
        if (storeOwnerId) {
          await this.notificationService.create({
            userId: storeOwnerId,
            storeId: dispute.order?.store?.id,
            title: 'Reclamo resuelto por acuerdo mutuo',
            body: 'El reclamo fue cerrado satisfactoriamente. Ambas partes confirmaron la resolución.',
            type: NotificationType.MEDIATION_RESPONSE,
            targetId: dispute.order.id,
          });
        }
      } else if (isBuyer) {
        // Avisar a la tienda que el cliente votó
        const storeOwnerId = dispute.order?.store?.owner?.id;
        if (storeOwnerId) {
          await this.notificationService.create({
            userId: storeOwnerId,
            storeId: dispute.order?.store?.id,
            title: 'El cliente marcó el reclamo como resuelto',
            body: 'El cliente indica que el problema fue resuelto. Confirma para cerrar el reclamo.',
            type: NotificationType.MEDIATION_RESPONSE,
            targetId: dispute.order.id,
          });
        }
      } else {
        // Avisar al cliente que la tienda votó
        const buyerId = dispute.order?.user?.id;
        if (buyerId) {
          await this.notificationService.create({
            userId: buyerId,
            title: 'La tienda marcó el reclamo como resuelto',
            body: 'La tienda indica que el problema fue resuelto. Confirma para cerrar el reclamo.',
            type: NotificationType.MEDIATION_RESPONSE,
            targetId: dispute.order.id,
          });
        }
      }
    } catch (err) {
      this.logger.error(`Error enviando notificación de mark-resolved: ${err.message}`);
    }

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

    const activeStatuses = [DisputeStatus.OPEN, DisputeStatus.MERCHANT_RESPONDED];
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
    this.notificationService.notifyAdminBadgesChanged().catch(() => {});
    this.logger.log(
      `Usuario ${requestingUser.id} (${isBuyer ? 'comprador' : 'comercio'}) escaló disputa ${id} a admin`,
    );

    // Notificaciones de escalación
    try {
      const buyerId = dispute.order?.user?.id;
      const storeOwnerId = dispute.order?.store?.owner?.id;

      // Notificar a la contraparte
      if (isBuyer && storeOwnerId) {
        await this.notificationService.create({
          userId: storeOwnerId,
          storeId: dispute.order?.store?.id,
          title: 'Reclamo escalado a soporte',
          body: 'El cliente ha escalado el reclamo al equipo de soporte para mediación.',
          type: NotificationType.MEDIATION_REQUEST,
          targetId: dispute.order.id,
        });
      } else if (!isBuyer && buyerId) {
        await this.notificationService.create({
          userId: buyerId,
          title: 'Reclamo escalado a soporte',
          body: 'La tienda ha escalado el reclamo al equipo de soporte para mediación.',
          type: NotificationType.MEDIATION_REQUEST,
          targetId: dispute.order.id,
        });
      }
    } catch (err) {
      this.logger.error(`Error enviando notificación de escalación: ${err.message}`);
    }

    return updated;
  }

  async resolve(id: string, dto: ResolveDisputeDto, adminUser: User) {
    const dispute = await this.disputeRepository.findOne({
      where: { id },
      relations: ['order', 'order.store'],
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

    const validTerminalStatuses = [
      DisputeStatus.RESOLVED,
      DisputeStatus.REFUNDED,
      DisputeStatus.REJECTED,
    ];

    if (!validTerminalStatuses.includes(dto.status)) {
      throw new BadRequestException(
        'El estado de resolución debe ser RESOLVED, REFUNDED o REJECTED.',
      );
    }

    dispute.resolution = dto.resolution;
    dispute.status = dto.status;
    dispute.adminNote = dto.adminNote.trim();
    dispute.resolvedAt = new Date();

    const saved = await this.disputeRepository.save(dispute);
    this.notificationService.notifyAdminBadgesChanged().catch(() => {});
    this.logger.log(
      `Disputa ${id} resuelta por admin ${adminUser.id} con resultado: ${dto.resolution} y estado ${dto.status}`,
    );

    // Hook Ranking según resultado de la resolución
    try {
      if (dispute.order?.store?.id) {
        if (dto.status === DisputeStatus.REFUNDED) {
          await this.rankingService.processEvent(
            dispute.order.store.id,
            RankingEventType.DISPUTE_LOST,
            saved.id,
          );
        } else if (dto.status === DisputeStatus.REJECTED) {
          await this.rankingService.processEvent(
            dispute.order.store.id,
            RankingEventType.DISPUTE_WON,
            saved.id,
          );
        }
      }
    } catch (rankErr) {
      this.logger.error(`Error processing ranking dispute resolution event: ${rankErr.message}`);
    }

    return {
      message: 'Disputa resuelta y archivada exitosamente.',
      dispute: saved,
    };
  }
}
