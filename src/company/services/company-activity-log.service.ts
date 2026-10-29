import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  CompanyActivityLog,
  ActivityLogModule,
} from '../entities/company-activity-log.entity';
import { ActivityLogQueryDto } from '../dto/activity-log-query.dto';

export interface LogActivityParams {
  companyId: string;
  storeId?: string;
  user?: any;
  actor?: any;
  module: ActivityLogModule | string;
  action: string;
  description: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, any>;
}

@Injectable()
export class CompanyActivityLogService {
  private readonly logger = new Logger(CompanyActivityLogService.name);

  constructor(
    @InjectRepository(CompanyActivityLog)
    private readonly activityLogRepository: Repository<CompanyActivityLog>,
  ) {}

  async log(params: LogActivityParams): Promise<void> {
    try {
      const { companyId, storeId, module, action, description, metadata } =
        params;
      const user = params.user || params.actor;

      if (!companyId || !user) {
        return;
      }

      const isCollab =
        user?.isCollaborator === true ||
        user?.actorType === 'COLLABORATOR';

      const actorType = isCollab ? 'COLLABORATOR' : 'OWNER';
      const actorId = user.id;
      const actorName =
        user.fullName ||
        (user.firstName
          ? `${user.firstName} ${user.lastName || ''}`.trim()
          : 'Usuario');
      const actorRoleName = isCollab
        ? user.collaboratorRole || (user.role?.name ?? 'Colaborador')
        : 'Administrador';

      const mergedMetadata = {
        ...(metadata || {}),
        ...(params.entityType ? { entityType: params.entityType } : {}),
        ...(params.entityId ? { entityId: params.entityId } : {}),
      };

      const logEntry = this.activityLogRepository.create({
        companyId,
        storeId: storeId || undefined,
        actorType,
        actorId,
        actorName,
        actorRoleName,
        module,
        action,
        description,
        metadata: Object.keys(mergedMetadata).length > 0 ? mergedMetadata : undefined,
      });

      await this.activityLogRepository.save(logEntry);
    } catch (error) {
      this.logger.error(
        `Error registrando log de actividad: ${error.message}`,
        error.stack,
      );
    }
  }

  async findAll(companyId: string, query: ActivityLogQueryDto) {
    const {
      limit = 20,
      offset = 0,
      storeId,
      actorId,
      module,
      startDate,
      endDate,
    } = query;

    const queryBuilder = this.activityLogRepository
      .createQueryBuilder('log')
      .where('log.companyId = :companyId', { companyId })
      .orderBy('log.createdAt', 'DESC')
      .take(Math.min(limit, 100))
      .skip(offset);

    if (storeId) {
      queryBuilder.andWhere('log.storeId = :storeId', { storeId });
    }

    if (actorId) {
      queryBuilder.andWhere('log.actorId = :actorId', { actorId });
    }

    if (module) {
      queryBuilder.andWhere('log.module = :module', { module });
    }

    if (startDate && endDate) {
      queryBuilder.andWhere('log.createdAt BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      });
    } else if (startDate) {
      queryBuilder.andWhere('log.createdAt >= :startDate', { startDate });
    } else if (endDate) {
      queryBuilder.andWhere('log.createdAt <= :endDate', { endDate });
    }

    const [items, total] = await queryBuilder.getManyAndCount();

    return {
      items,
      total,
      limit,
      offset,
    };
  }
}
