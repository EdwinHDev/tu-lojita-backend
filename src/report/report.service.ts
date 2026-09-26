import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import {
  Report,
  ReportAction,
  ReportStatus,
} from './entities/report.entity';
import { CreateReportDto } from './dto/create-report.dto';
import { ResolveReportDto } from './dto/resolve-report.dto';
import { ReportPaginationDto } from './dto/report-pagination.dto';
import { User } from 'src/user/entities/user.entity';
import { Store } from 'src/store/entities/store.entity';
import { Item } from 'src/item/entities/item.entity';
import { StoreStrike } from 'src/store/entities/store-strike.entity';
import { StoreStatus } from 'src/store/types/status.enum';
import { NotificationService } from 'src/notification/notification.service';
import { NotificationType } from 'src/notification/entities/notification.entity';
import { UserRole } from 'src/user/types/user-role.enum';
import { MailService } from 'src/common/mail/mail.service';
import { RankingService } from 'src/ranking/services/ranking.service';
import { RankingEventType } from 'src/ranking/types';

@Injectable()
export class ReportService {
  constructor(
    @InjectRepository(Report)
    private readonly reportRepository: Repository<Report>,
    @InjectRepository(Store)
    private readonly storeRepository: Repository<Store>,
    @InjectRepository(Item)
    private readonly itemRepository: Repository<Item>,
    @InjectRepository(StoreStrike)
    private readonly storeStrikeRepository: Repository<StoreStrike>,
    private readonly notificationService: NotificationService,
    private readonly mailService: MailService,
    private readonly rankingService: RankingService,
  ) {}

  async create(createReportDto: CreateReportDto, reporter: User) {
    const report = this.reportRepository.create({
      ...createReportDto,
      reporterId: reporter.id,
      status: ReportStatus.PENDING,
      actionTaken: ReportAction.NONE,
    });

    const savedReport = await this.reportRepository.save(report);
    this.notificationService.notifyAdminBadgesChanged().catch(() => {});
    return savedReport;
  }

  async findAll(paginationDto: ReportPaginationDto) {
    const { limit = 20, offset = 0, status, type, category } = paginationDto;

    const queryBuilder = this.reportRepository
      .createQueryBuilder('report')
      .leftJoinAndSelect('report.reporter', 'reporter')
      .leftJoinAndSelect('report.targetStore', 'targetStore')
      .leftJoinAndSelect('report.targetItem', 'targetItem')
      .leftJoinAndSelect('targetItem.store', 'itemStore')
      .leftJoinAndSelect('report.targetChatMessage', 'targetChatMessage')
      .leftJoinAndSelect('targetChatMessage.sender', 'chatMessageSender')
      .leftJoinAndSelect('targetChatMessage.order', 'chatMessageOrder')
      .leftJoinAndSelect('report.targetUser', 'targetUser')
      .leftJoinAndSelect('report.resolvedBy', 'resolvedBy')
      .orderBy('report.createdAt', 'DESC')
      .take(limit)
      .skip(offset);

    if (status) {
      queryBuilder.andWhere('report.status = :status', { status });
    }
    if (type) {
      queryBuilder.andWhere('report.type = :type', { type });
    }
    if (category) {
      queryBuilder.andWhere('report.category = :category', { category });
    }

    const [data, total] = await queryBuilder.getManyAndCount();

    return {
      data,
      items: data,
      total,
      limit,
      offset,
    };
  }

  async findMyReports(userId: string, paginationDto: ReportPaginationDto) {
    const { limit = 20, offset = 0, status } = paginationDto;

    const queryBuilder = this.reportRepository
      .createQueryBuilder('report')
      .leftJoinAndSelect('report.targetStore', 'targetStore')
      .leftJoinAndSelect('report.targetItem', 'targetItem')
      .leftJoinAndSelect('targetItem.store', 'itemStore')
      .leftJoinAndSelect('report.targetChatMessage', 'targetChatMessage')
      .leftJoinAndSelect('targetChatMessage.sender', 'chatMessageSender')
      .leftJoinAndSelect('targetChatMessage.order', 'chatMessageOrder')
      .leftJoinAndSelect('report.targetUser', 'targetUser')
      .leftJoinAndSelect('report.resolvedBy', 'resolvedBy')
      .where(
        '(report.reporterId = :userId OR ((report.targetUserId = :userId OR chatMessageSender.id = :userId) AND report.status != :pendingStatus))',
        { userId, pendingStatus: ReportStatus.PENDING },
      )
      .orderBy('report.createdAt', 'DESC')
      .take(limit)
      .skip(offset);

    if (status) {
      queryBuilder.andWhere('report.status = :status', { status });
    }

    const [data, total] = await queryBuilder.getManyAndCount();

    return {
      data,
      items: data,
      total,
      limit,
      offset,
    };
  }

  async findOne(id: string, user?: User) {
    const report = await this.reportRepository.findOne({
      where: { id },
      relations: [
        'reporter',
        'targetStore',
        'targetItem',
        'targetItem.store',
        'targetChatMessage',
        'targetChatMessage.sender',
        'targetChatMessage.order',
        'targetUser',
        'resolvedBy',
      ],
    });

    if (!report) {
      throw new NotFoundException(`Reporte con ID ${id} no encontrado`);
    }

    if (user && user.role !== UserRole.ADMIN) {
      const isReporter = report.reporterId === user.id;
      const isTarget =
        report.targetUserId === user.id ||
        report.targetChatMessage?.sender?.id === user.id;

      if (!isReporter && !(isTarget && report.status !== ReportStatus.PENDING)) {
        throw new ForbiddenException('No tienes permiso para ver este reporte');
      }
    }

    return report;
  }

  async resolve(id: string, dto: ResolveReportDto, adminUser: User) {
    if (adminUser.role !== UserRole.ADMIN) {
      throw new ForbiddenException(
        'Solo los administradores pueden resolver reportes e imponer sanciones',
      );
    }

    const report = await this.findOne(id);

    report.status =
      dto.status ||
      (dto.actionTaken === ReportAction.DISMISSED
        ? ReportStatus.DISMISSED
        : ReportStatus.RESOLVED);
    report.actionTaken = dto.actionTaken;
    report.adminNotes = dto.adminNotes;
    if (dto.evidenceMessages !== undefined) {
      report.evidenceMessages = dto.evidenceMessages;
    }
    report.resolvedAt = new Date();
    report.resolvedById = adminUser.id;

    let targetStore: Store | null = null;
    let targetItem: Item | null = null;
    let activeStrikes = 0;

    // Acción: Ocultar artículo
    if (
      dto.actionTaken === ReportAction.ITEM_HIDDEN &&
      report.targetItemId
    ) {
      targetItem = await this.itemRepository.findOne({
        where: { id: report.targetItemId },
        relations: ['store', 'store.owner', 'store.company', 'store.company.owner'],
      });
      if (targetItem) {
        targetItem.isActive = false;
        await this.itemRepository.save(targetItem);
      }
    }

    // Acción: Suspender tienda directamente
    if (
      dto.actionTaken === ReportAction.STORE_SUSPENDED &&
      report.targetStoreId
    ) {
      targetStore = await this.storeRepository.findOne({
        where: { id: report.targetStoreId },
        relations: ['owner', 'company', 'company.owner'],
      });
      if (targetStore) {
        targetStore.status = StoreStatus.SUSPENDED;
        await this.storeRepository.save(targetStore);
      }
    }

    // Acción: Aplicar Strike con expiración a 90 días
    if (
      dto.actionTaken === ReportAction.STRIKE_ISSUED &&
      report.targetStoreId
    ) {
      targetStore = await this.storeRepository.findOne({
        where: { id: report.targetStoreId },
        relations: ['owner', 'company', 'company.owner'],
      });

      if (!targetStore) {
        throw new NotFoundException(
          `Tienda asociada al reporte no encontrada para aplicar strike`,
        );
      }

      const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
      const strike = this.storeStrikeRepository.create({
        storeId: targetStore.id,
        reportId: report.id,
        issuedById: adminUser.id,
        reason: dto.strikeReason || dto.adminNotes || report.reason,
        expiresAt,
      });

      await this.storeStrikeRepository.save(strike);

      // Hook Ranking: penalización por strike administrativo
      try {
        await this.rankingService.processEvent(
          targetStore.id,
          RankingEventType.STRIKE,
          strike.id,
          undefined,
          undefined,
          { reason: strike.reason },
        );
      } catch (rankErr) {
        console.error(`Error processing ranking strike event: ${rankErr.message}`);
      }

      // Calcular número de strikes activos (< 90 días y no revocados)
      activeStrikes = await this.storeStrikeRepository.count({
        where: {
          storeId: targetStore.id,
          expiresAt: MoreThan(new Date()),
          isRevoked: false,
        },
      });

      targetStore.strikes = activeStrikes;

      // Si acumula 3 o más strikes activos, suspensión automática
      if (activeStrikes >= 3) {
        targetStore.status = StoreStatus.SUSPENDED;
      }

      await this.storeRepository.save(targetStore);
    }

    const savedReport = await this.reportRepository.save(report);

    // Notificación transparente al cliente denunciante
    try {
      await this.notificationService.create({
        userId: report.reporterId,
        title: 'Resolución de reporte',
        body: `Tu reporte ha sido evaluado por moderación. Medida tomada: ${this.getActionDescription(
          dto.actionTaken,
        )}.`,
        type: NotificationType.REPORT_RESOLUTION,
        targetId: report.id,
      });
    } catch (e) {}

    // Notificaciones transparentes a la tienda afectada
    const storeToNotify = targetStore || (targetItem ? targetItem.store : null);
    if (storeToNotify) {
      const owner = storeToNotify.owner || storeToNotify.company?.owner;
      const ownerId = owner?.id;
      const ownerEmail = owner?.email;

      if (ownerId) {
        try {
          if (dto.actionTaken === ReportAction.STRIKE_ISSUED) {
            const strikeExpStr = new Date(
              Date.now() + 90 * 24 * 60 * 60 * 1000,
            ).toLocaleDateString('es-ES', {
              day: '2-digit',
              month: 'long',
              year: 'numeric',
            });

            await this.notificationService.create({
              userId: ownerId,
              storeId: storeToNotify.id,
              title: `Aviso de moderación: Strike aplicado (${activeStrikes}/3)`,
              body: `Tu tienda ha recibido un strike por: ${
                dto.strikeReason || report.reason
              }. Vence en 90 días.${
                activeStrikes >= 3
                  ? ' Al acumular 3 strikes activos, tu tienda ha sido suspendida automáticamente.'
                  : ''
              }`,
              type: NotificationType.STRIKE_APPLIED,
              targetId: storeToNotify.id,
            });

            if (ownerEmail) {
              this.mailService
                .sendStoreStrikeNotice({
                  toEmail: ownerEmail,
                  storeName: storeToNotify.name,
                  strikeCount: activeStrikes,
                  reason: dto.strikeReason || report.reason,
                  expiresAt: strikeExpStr,
                })
                .catch(() => {});

              if (activeStrikes >= 3) {
                this.mailService
                  .sendStoreSuspensionNotice({
                    toEmail: ownerEmail,
                    storeName: storeToNotify.name,
                    reason:
                      'Acumulación de 3 strikes de sanción por infracciones a normativas comunitarias.',
                  })
                  .catch(() => {});
              }
            }
          } else if (dto.actionTaken === ReportAction.ITEM_HIDDEN && targetItem) {
            await this.notificationService.create({
              userId: ownerId,
              storeId: storeToNotify.id,
              title: 'Publicación desactivada',
              body: `Tu artículo "${targetItem.title}" ha sido ocultado por moderación debido al incumplimiento de normativas.`,
              type: NotificationType.ITEM_HIDDEN,
              targetId: targetItem.id,
            });

            if (ownerEmail) {
              this.mailService
                .sendItemHiddenNotice({
                  toEmail: ownerEmail,
                  storeName: storeToNotify.name,
                  itemName: targetItem.title,
                  reason: dto.adminNotes || report.reason,
                })
                .catch(() => {});
            }
          } else if (dto.actionTaken === ReportAction.STORE_SUSPENDED) {
            await this.notificationService.create({
              userId: ownerId,
              storeId: storeToNotify.id,
              title: 'Tienda suspendida',
              body: `Tu tienda ha sido suspendida por el equipo de moderación. Motivo: ${
                dto.adminNotes || report.reason
              }.`,
              type: NotificationType.STORE_SUSPENDED,
              targetId: storeToNotify.id,
            });

            if (ownerEmail) {
              this.mailService
                .sendStoreSuspensionNotice({
                  toEmail: ownerEmail,
                  storeName: storeToNotify.name,
                  reason: dto.adminNotes || report.reason,
                })
                .catch(() => {});
            }
          }
        } catch (e) {}
      }
    }

    this.notificationService.notifyAdminBadgesChanged().catch(() => {});
    return savedReport;
  }

  async getStoreStrikes(storeId: string) {
    return await this.storeStrikeRepository.find({
      where: { storeId },
      order: { createdAt: 'DESC' },
    });
  }

  async getActiveStrikeCount(storeId: string): Promise<number> {
    return await this.storeStrikeRepository.count({
      where: {
        storeId,
        expiresAt: MoreThan(new Date()),
        isRevoked: false,
      },
    });
  }

  private getActionDescription(action: ReportAction): string {
    switch (action) {
      case ReportAction.STRIKE_ISSUED:
        return 'Se aplicó una sanción (strike) a la tienda responsable';
      case ReportAction.STORE_SUSPENDED:
        return 'La tienda ha sido suspendida por incumplimiento reiterado';
      case ReportAction.ITEM_HIDDEN:
        return 'La publicación ha sido retirada de la plataforma';
      case ReportAction.CHAT_PENALTY_APPLIED:
        return 'Se aplicó una sanción disciplinaria de moderación en el chat';
      case ReportAction.DISMISSED:
        return 'Reporte desestimado tras revisión';
      default:
        return 'Revisado';
    }
  }
}
