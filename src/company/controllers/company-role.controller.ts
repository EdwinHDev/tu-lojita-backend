import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  ForbiddenException,
} from '@nestjs/common';
import { CompanyRoleService } from '../services/company-role.service';
import { CreateCompanyRoleDto } from '../dto/create-company-role.dto';
import { UpdateCompanyRoleDto } from '../dto/update-company-role.dto';
import { Auth } from 'src/auth/decorators/auth.decorator';
import { GetUser } from 'src/auth/decorators/get-user.decorator';
import { UserRole } from 'src/user/types/user-role.enum';
import { RequirePermissions } from 'src/auth/decorators/require-permissions.decorator';
import { CompanyPermission } from '../types/company-permission.enum';

@Controller('companies/:companyId/roles')
@Auth(UserRole.COMPANY, UserRole.ADMIN)
export class CompanyRoleController {
  constructor(private readonly roleService: CompanyRoleService) {}

  private validateCompanyAccess(companyId: string, actor: any) {
    if (actor.role === UserRole.ADMIN) return;
    const actorCompanyId = actor.company?.id;
    if (actorCompanyId !== companyId) {
      throw new ForbiddenException(
        'No tienes permiso para gestionar roles de esta empresa',
      );
    }
  }

  @Get('permissions-catalog')
  getPermissionsCatalog() {
    return this.roleService.getAvailablePermissionsCatalog();
  }

  @Get('presets')
  getRolePresets() {
    return this.roleService.getRolePresets();
  }

  @Post()
  @RequirePermissions(CompanyPermission.COLLABORATORS_MANAGE)
  create(
    @Param('companyId') companyId: string,
    @Body() createDto: CreateCompanyRoleDto,
    @GetUser() actor: any,
  ) {
    this.validateCompanyAccess(companyId, actor);
    return this.roleService.create(companyId, createDto);
  }

  @Get()
  findAll(@Param('companyId') companyId: string, @GetUser() actor: any) {
    this.validateCompanyAccess(companyId, actor);
    return this.roleService.findAll(companyId);
  }

  @Get(':roleId')
  findOne(
    @Param('companyId') companyId: string,
    @Param('roleId') roleId: string,
    @GetUser() actor: any,
  ) {
    this.validateCompanyAccess(companyId, actor);
    return this.roleService.findOne(companyId, roleId);
  }

  @Patch(':roleId')
  @RequirePermissions(CompanyPermission.COLLABORATORS_MANAGE)
  update(
    @Param('companyId') companyId: string,
    @Param('roleId') roleId: string,
    @Body() updateDto: UpdateCompanyRoleDto,
    @GetUser() actor: any,
  ) {
    this.validateCompanyAccess(companyId, actor);
    return this.roleService.update(companyId, roleId, updateDto);
  }

  @Delete(':roleId')
  @RequirePermissions(CompanyPermission.COLLABORATORS_MANAGE)
  remove(
    @Param('companyId') companyId: string,
    @Param('roleId') roleId: string,
    @GetUser() actor: any,
  ) {
    this.validateCompanyAccess(companyId, actor);
    return this.roleService.remove(companyId, roleId);
  }
}
