import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CompanyRole } from '../entities/company-role.entity';
import { CompanyRolePermission } from '../entities/company-role-permission.entity';
import { Company } from '../entities/company.entity';
import { CreateCompanyRoleDto } from '../dto/create-company-role.dto';
import { UpdateCompanyRoleDto } from '../dto/update-company-role.dto';
import {
  ALL_COMPANY_PERMISSIONS,
  DEFAULT_ROLE_PRESETS,
  PERMISSION_CATALOG,
  PermissionMetadata,
  RolePreset,
} from '../types/company-permission.enum';

@Injectable()
export class CompanyRoleService {
  constructor(
    @InjectRepository(CompanyRole)
    private readonly roleRepository: Repository<CompanyRole>,
    @InjectRepository(CompanyRolePermission)
    private readonly rolePermissionRepository: Repository<CompanyRolePermission>,
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
  ) {}

  /**
   * Sembrar el rol predeterminado "Administrador" con todos los permisos
   */
  async seedDefaultRole(companyId: string): Promise<CompanyRole> {
    const existing = await this.roleRepository.findOne({
      where: { company: { id: companyId }, name: 'Administrador' },
      relations: ['permissions'],
    });

    if (existing) {
      // Garantizar que si se agregaron nuevos permisos al enum, el Administrador los tenga todos
      const existingPerms = new Set(existing.permissions.map((p) => p.permission));
      const missing = ALL_COMPANY_PERMISSIONS.filter((p) => !existingPerms.has(p));
      if (missing.length > 0) {
        const newEntities = missing.map((perm) =>
          this.rolePermissionRepository.create({
            role: existing,
            permission: perm,
          }),
        );
        await this.rolePermissionRepository.save(newEntities);
        existing.permissions.push(...newEntities);
      }
      return existing;
    }

    const company = await this.companyRepository.findOne({
      where: { id: companyId },
    });

    if (!company) {
      throw new NotFoundException('Empresa no encontrada');
    }

    const role = this.roleRepository.create({
      company,
      name: 'Administrador',
      description:
        'Rol administrativo con acceso completo a las funciones operativas de la empresa.',
      isSystemDefault: true,
    });

    const savedRole = await this.roleRepository.save(role);

    const permissions = ALL_COMPANY_PERMISSIONS.map((perm) =>
      this.rolePermissionRepository.create({
        role: savedRole,
        permission: perm,
      }),
    );

    await this.rolePermissionRepository.save(permissions);
    savedRole.permissions = permissions;

    return savedRole;
  }

  /**
   * Crear un nuevo rol personalizado para la empresa
   */
  async create(
    companyId: string,
    createDto: CreateCompanyRoleDto,
  ): Promise<CompanyRole> {
    const company = await this.companyRepository.findOne({
      where: { id: companyId },
    });

    if (!company) {
      throw new NotFoundException('Empresa no encontrada');
    }

    // Verificar unicidad de nombre en la empresa
    const existingRole = await this.roleRepository.findOne({
      where: {
        company: { id: companyId },
        name: createDto.name.trim(),
      },
    });

    if (existingRole) {
      throw new ConflictException(
        `Ya existe un rol con el nombre "${createDto.name}" en esta empresa`,
      );
    }

    const role = this.roleRepository.create({
      company,
      name: createDto.name.trim(),
      description: createDto.description?.trim(),
      isSystemDefault: false,
    });

    const savedRole = await this.roleRepository.save(role);

    // Guardar permisos seleccionados
    const uniquePermissions = Array.from(new Set(createDto.permissions));
    const rolePermissions = uniquePermissions.map((perm) =>
      this.rolePermissionRepository.create({
        role: savedRole,
        permission: perm,
      }),
    );

    await this.rolePermissionRepository.save(rolePermissions);
    savedRole.permissions = rolePermissions;

    return savedRole;
  }

  /**
   * Listar todos los roles de una empresa (incluyendo el rol por defecto)
   */
  async findAll(companyId: string): Promise<CompanyRole[]> {
    // Garantizar que la empresa tenga su rol base Administrador
    await this.seedDefaultRole(companyId);

    return this.roleRepository.find({
      where: { company: { id: companyId } },
      relations: ['permissions', 'collaborators'],
      order: { isSystemDefault: 'DESC', name: 'ASC' },
    });
  }

  /**
   * Obtener detalle de un rol específico
   */
  async findOne(companyId: string, roleId: string): Promise<CompanyRole> {
    const role = await this.roleRepository.findOne({
      where: { id: roleId, company: { id: companyId } },
      relations: ['permissions', 'collaborators'],
    });

    if (!role) {
      throw new NotFoundException('Rol no encontrado');
    }

    return role;
  }

  /**
   * Actualizar un rol existente
   */
  async update(
    companyId: string,
    roleId: string,
    updateDto: UpdateCompanyRoleDto,
  ): Promise<CompanyRole> {
    const role = await this.findOne(companyId, roleId);

    // Si es el rol de sistema, proteger su nombre y permisos críticos
    if (role.isSystemDefault) {
      if (updateDto.name && updateDto.name.trim() !== 'Administrador') {
        throw new BadRequestException(
          'No es posible cambiar el nombre del rol predeterminado de Administrador',
        );
      }
      if (
        updateDto.permissions &&
        updateDto.permissions.length < ALL_COMPANY_PERMISSIONS.length
      ) {
        throw new BadRequestException(
          'No es posible revocar permisos al rol predeterminado de Administrador',
        );
      }
    }

    if (updateDto.name && updateDto.name.trim() !== role.name) {
      const existing = await this.roleRepository.findOne({
        where: {
          company: { id: companyId },
          name: updateDto.name.trim(),
        },
      });

      if (existing && existing.id !== roleId) {
        throw new ConflictException(
          `Ya existe otro rol con el nombre "${updateDto.name}"`,
        );
      }
      role.name = updateDto.name.trim();
    }

    if (updateDto.description !== undefined) {
      role.description = updateDto.description?.trim();
    }

    await this.roleRepository.save(role);

    // Actualizar permisos si fueron enviados
    if (updateDto.permissions) {
      // Eliminar anteriores y asociar nuevos
      await this.rolePermissionRepository.delete({ role: { id: role.id } });

      const uniquePerms = Array.from(new Set(updateDto.permissions));
      const newPermissions = uniquePerms.map((perm) =>
        this.rolePermissionRepository.create({
          role,
          permission: perm,
        }),
      );
      await this.rolePermissionRepository.save(newPermissions);
      role.permissions = newPermissions;
    }

    return role;
  }

  /**
   * Eliminar un rol personalizado
   */
  async remove(
    companyId: string,
    roleId: string,
  ): Promise<{ message: string }> {
    const role = await this.findOne(companyId, roleId);

    if (role.isSystemDefault) {
      throw new ForbiddenException(
        'El rol predeterminado del sistema no puede ser eliminado',
      );
    }

    if (role.collaborators && role.collaborators.length > 0) {
      throw new BadRequestException(
        `No puedes eliminar este rol porque tiene ${role.collaborators.length} colaborador(es) asignado(s). Reasigna a los colaboradores antes de eliminarlo.`,
      );
    }

    await this.roleRepository.remove(role);
    return { message: 'Rol eliminado exitosamente' };
  }

  /**
   * Retornar el catálogo global de permisos del sistema agrupados
   */
  getAvailablePermissionsCatalog(): PermissionMetadata[] {
    return PERMISSION_CATALOG;
  }

  /**
   * Retornar las plantillas de roles predeterminadas
   */
  getRolePresets(): RolePreset[] {
    return DEFAULT_ROLE_PRESETS;
  }
}
