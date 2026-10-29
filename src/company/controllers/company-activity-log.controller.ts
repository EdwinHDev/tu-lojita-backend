import {
  Controller,
  Get,
  Param,
  Query,
  ForbiddenException,
} from '@nestjs/common';
import { CompanyActivityLogService } from '../services/company-activity-log.service';
import { ActivityLogQueryDto } from '../dto/activity-log-query.dto';
import { Auth } from 'src/auth/decorators/auth.decorator';
import { GetUser } from 'src/auth/decorators/get-user.decorator';
import { UserRole } from 'src/user/types/user-role.enum';

@Controller('companies/:companyId/activity-logs')
@Auth(UserRole.COMPANY, UserRole.ADMIN)
export class CompanyActivityLogController {
  constructor(
    private readonly activityLogService: CompanyActivityLogService,
  ) {}

  private validateCompanyAccess(companyId: string, actor: any) {
    if (actor.role === UserRole.ADMIN) return;

    // Exclusivo para el propietario de la empresa; colaboradores quedan estrictamente excluidos
    if (actor.isCollaborator || actor.actorType === 'COLLABORATOR') {
      throw new ForbiddenException(
        'Solo el administrador o propietario de la empresa puede consultar el historial de actividades.',
      );
    }

    const actorCompanyId = actor.company?.id;
    if (actorCompanyId !== companyId) {
      throw new ForbiddenException(
        'No tienes permiso para consultar el historial de esta empresa.',
      );
    }
  }

  @Get()
  async findAll(
    @Param('companyId') companyId: string,
    @Query() query: ActivityLogQueryDto,
    @GetUser() actor: any,
  ) {
    this.validateCompanyAccess(companyId, actor);
    return this.activityLogService.findAll(companyId, query);
  }
}

