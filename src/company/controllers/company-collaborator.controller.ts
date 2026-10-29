import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  ForbiddenException,
  Query,
} from '@nestjs/common';
import { CompanyCollaboratorService } from '../services/company-collaborator.service';
import { CreateCompanyCollaboratorDto } from '../dto/create-company-collaborator.dto';
import { UpdateCompanyCollaboratorDto } from '../dto/update-company-collaborator.dto';
import { Auth } from 'src/auth/decorators/auth.decorator';
import { GetUser } from 'src/auth/decorators/get-user.decorator';
import { UserRole } from 'src/user/types/user-role.enum';
import { RequirePermissions } from 'src/auth/decorators/require-permissions.decorator';
import { CompanyPermission } from '../types/company-permission.enum';

@Controller('companies/:companyId/collaborators')
@Auth(UserRole.COMPANY, UserRole.ADMIN)
export class CompanyCollaboratorController {
  constructor(
    private readonly collaboratorService: CompanyCollaboratorService,
  ) {}

  private validateCompanyAccess(companyId: string, actor: any) {
    if (actor.role === UserRole.ADMIN) return;
    const actorCompanyId = actor.company?.id;
    if (actorCompanyId !== companyId) {
      throw new ForbiddenException(
        'No tienes permiso para gestionar colaboradores de esta empresa',
      );
    }
  }

  @Post()
  @RequirePermissions(CompanyPermission.COLLABORATORS_MANAGE)
  create(
    @Param('companyId') companyId: string,
    @Body() createDto: CreateCompanyCollaboratorDto,
    @GetUser() actor: any,
  ) {
    this.validateCompanyAccess(companyId, actor);
    return this.collaboratorService.create(companyId, createDto, actor);
  }

  @Get()
  async findAll(
    @Param('companyId') companyId: string,
    @GetUser() actor: any,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ) {
    this.validateCompanyAccess(companyId, actor);

    // Retrocompatibilidad: Si el cliente no envía limit ni offset (app anterior),
    // retornamos el arreglo plano `items` para evitar errores de casteo en versiones previas.
    const isLegacyRequest = limit === undefined && offset === undefined;

    const result = await this.collaboratorService.findAll(
      companyId,
      limit !== undefined ? +limit : 50,
      offset !== undefined ? +offset : 0,
    );

    if (isLegacyRequest) {
      return result.items;
    }

    return result;
  }

  @Get(':collaboratorId')
  findOne(
    @Param('companyId') companyId: string,
    @Param('collaboratorId') collaboratorId: string,
    @GetUser() actor: any,
  ) {
    this.validateCompanyAccess(companyId, actor);
    return this.collaboratorService.findOne(companyId, collaboratorId);
  }

  @Patch(':collaboratorId')
  @RequirePermissions(CompanyPermission.COLLABORATORS_MANAGE)
  update(
    @Param('companyId') companyId: string,
    @Param('collaboratorId') collaboratorId: string,
    @Body() updateDto: UpdateCompanyCollaboratorDto,
    @GetUser() actor: any,
  ) {
    this.validateCompanyAccess(companyId, actor);
    return this.collaboratorService.update(
      companyId,
      collaboratorId,
      updateDto,
      actor,
    );
  }

  @Post(':collaboratorId/regenerate-password')
  @RequirePermissions(CompanyPermission.COLLABORATORS_MANAGE)
  regeneratePassword(
    @Param('companyId') companyId: string,
    @Param('collaboratorId') collaboratorId: string,
    @GetUser() actor: any,
  ) {
    this.validateCompanyAccess(companyId, actor);
    return this.collaboratorService.regeneratePassword(
      companyId,
      collaboratorId,
      actor,
    );
  }

  @Delete(':collaboratorId')
  @RequirePermissions(CompanyPermission.COLLABORATORS_MANAGE)
  remove(
    @Param('companyId') companyId: string,
    @Param('collaboratorId') collaboratorId: string,
    @GetUser() actor: any,
  ) {
    this.validateCompanyAccess(companyId, actor);
    return this.collaboratorService.remove(companyId, collaboratorId, actor);
  }
}
