import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { CompanyCollaborator } from '../entities/company-collaborator.entity';
import { Company } from '../entities/company.entity';
import { CompanyRole } from '../entities/company-role.entity';
import { Store } from 'src/store/entities/store.entity';
import { CollaboratorCredentialService } from './collaborator-credential.service';
import { CreateCompanyCollaboratorDto } from '../dto/create-company-collaborator.dto';
import { UpdateCompanyCollaboratorDto } from '../dto/update-company-collaborator.dto';
import { CompanyActivityLogService } from './company-activity-log.service';
import { ActivityLogModule } from '../entities/company-activity-log.entity';

@Injectable()
export class CompanyCollaboratorService {
  constructor(
    @InjectRepository(CompanyCollaborator)
    private readonly collaboratorRepository: Repository<CompanyCollaborator>,
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
    @InjectRepository(CompanyRole)
    private readonly roleRepository: Repository<CompanyRole>,
    @InjectRepository(Store)
    private readonly storeRepository: Repository<Store>,
    private readonly credentialService: CollaboratorCredentialService,
    private readonly activityLogService: CompanyActivityLogService,
  ) {}

  /**
   * Crear un nuevo colaborador con credenciales autogeneradas
   */
  async create(
    companyId: string,
    createDto: CreateCompanyCollaboratorDto,
    actor?: any,
  ): Promise<{
    collaborator: CompanyCollaborator;
    generatedAccessId: string;
    generatedInitialPassword: string;
  }> {
    const company = await this.companyRepository.findOne({
      where: { id: companyId },
    });

    if (!company) {
      throw new NotFoundException('Empresa no encontrada');
    }

    const role = await this.roleRepository.findOne({
      where: { id: createDto.roleId, company: { id: companyId } },
    });

    if (!role) {
      throw new NotFoundException('El rol asignado no existe en esta empresa');
    }

    // Resolver sucursales
    let stores: Store[] = [];
    if (!createDto.hasFullBranchAccess && createDto.storeIds && createDto.storeIds.length > 0) {
      stores = await this.storeRepository.find({
        where: {
          id: In(createDto.storeIds),
          company: { id: companyId },
        },
      });

      if (stores.length === 0) {
        throw new BadRequestException(
          'Debes asignar al menos una sucursal válida de la empresa',
        );
      }
    }

    // Generar credenciales de 8 dígitos
    const accessId = await this.credentialService.generateAccessId();
    const initialPassword = this.credentialService.generateInitialPassword();

    const collaborator = this.collaboratorRepository.create({
      company,
      role,
      accessId,
      password: initialPassword, // Será hasheado en @BeforeInsert
      firstName: createDto.firstName.trim(),
      lastName: createDto.lastName.trim(),
      identification: createDto.identification?.trim(),
      phone: createDto.phone?.trim(),
      hasFullBranchAccess: createDto.hasFullBranchAccess || false,
      stores,
      isActive: true,
    });

    const saved = await this.collaboratorRepository.save(collaborator);

    this.activityLogService.log({
      companyId,
      actor,
      module: ActivityLogModule.COLLABORATORS,
      action: 'COLLABORATOR_CREATED',
      description: `Colaborador ${saved.firstName} ${saved.lastName} registrado con rol ${role.name}`,
      entityType: 'collaborator',
      entityId: saved.id,
      metadata: {
        accessId,
        roleId: role.id,
        roleName: role.name,
        hasFullBranchAccess: saved.hasFullBranchAccess,
        storesCount: saved.stores?.length || 0,
      },
    });

    // Retornar el colaborador con las credenciales legibles para permitir al dueño copiarlas
    return {
      collaborator: saved,
      generatedAccessId: accessId,
      generatedInitialPassword: initialPassword,
    };
  }

  /**
   * Listar colaboradores de una empresa con paginación
   */
  async findAll(
    companyId: string,
    limit: number = 10,
    offset: number = 0,
  ): Promise<{
    items: CompanyCollaborator[];
    total: number;
    hasMore: boolean;
    limit: number;
    offset: number;
  }> {
    const [items, total] = await this.collaboratorRepository.findAndCount({
      where: { company: { id: companyId } },
      relations: ['role', 'stores'],
      order: { createdAt: 'DESC' },
      take: limit,
      skip: offset,
    });

    return {
      items,
      total,
      hasMore: offset + items.length < total,
      limit,
      offset,
    };
  }

  /**
   * Obtener detalle de un colaborador
   */
  async findOne(
    companyId: string,
    collaboratorId: string,
  ): Promise<CompanyCollaborator> {
    const collaborator = await this.collaboratorRepository.findOne({
      where: { id: collaboratorId, company: { id: companyId } },
      relations: ['role', 'role.permissions', 'stores'],
    });

    if (!collaborator) {
      throw new NotFoundException('Colaborador no encontrado');
    }

    return collaborator;
  }

  /**
   * Actualizar datos, rol o sucursales de un colaborador
   */
  async update(
    companyId: string,
    collaboratorId: string,
    updateDto: UpdateCompanyCollaboratorDto,
    actor?: any,
  ): Promise<CompanyCollaborator> {
    const collaborator = await this.findOne(companyId, collaboratorId);
    const prevRoleName = collaborator.role?.name;
    const prevStatus = collaborator.isActive;

    if (updateDto.firstName) {
      collaborator.firstName = updateDto.firstName.trim();
    }
    if (updateDto.lastName) {
      collaborator.lastName = updateDto.lastName.trim();
    }
    if (updateDto.identification !== undefined) {
      collaborator.identification = updateDto.identification?.trim();
    }
    if (updateDto.phone !== undefined) {
      collaborator.phone = updateDto.phone?.trim();
    }
    if (updateDto.isActive !== undefined) {
      collaborator.isActive = updateDto.isActive;
      if (!updateDto.isActive) {
        collaborator.tokenVersion = (collaborator.tokenVersion || 0) + 1; // Invalida sesiones activas
      }
    }
    if (updateDto.hasFullBranchAccess !== undefined) {
      collaborator.hasFullBranchAccess = updateDto.hasFullBranchAccess;
    }

    if (updateDto.roleId) {
      const role = await this.roleRepository.findOne({
        where: { id: updateDto.roleId, company: { id: companyId } },
      });
      if (!role) {
        throw new NotFoundException('El nuevo rol no existe en la empresa');
      }
      collaborator.role = role;
    }

    if (updateDto.storeIds) {
      if (!collaborator.hasFullBranchAccess && updateDto.storeIds.length === 0) {
        throw new BadRequestException(
          'Debes asignar al menos una sucursal si no tiene acceso total',
        );
      }
      const stores = await this.storeRepository.find({
        where: {
          id: In(updateDto.storeIds),
          company: { id: companyId },
        },
      });
      collaborator.stores = stores;
    }

    const saved = await this.collaboratorRepository.save(collaborator);

    let action = 'COLLABORATOR_UPDATED';
    let description = `Colaborador ${saved.firstName} ${saved.lastName} actualizado`;

    if (updateDto.isActive !== undefined && updateDto.isActive !== prevStatus) {
      action = 'COLLABORATOR_STATUS_CHANGED';
      description = `Colaborador ${saved.firstName} ${saved.lastName} ${saved.isActive ? 'reactivado' : 'suspendido'}`;
    } else if (updateDto.roleId && saved.role?.name !== prevRoleName) {
      action = 'COLLABORATOR_ROLE_UPDATED';
      description = `Rol de ${saved.firstName} ${saved.lastName} cambiado a ${saved.role?.name}`;
    }

    this.activityLogService.log({
      companyId,
      actor,
      module: ActivityLogModule.COLLABORATORS,
      action,
      description,
      entityType: 'collaborator',
      entityId: saved.id,
      metadata: {
        roleId: saved.role?.id,
        roleName: saved.role?.name,
        isActive: saved.isActive,
        hasFullBranchAccess: saved.hasFullBranchAccess,
      },
    });

    return saved;
  }

  /**
   * Regenerar contraseña temporal para un colaborador (útil si la olvidó)
   */
  async regeneratePassword(
    companyId: string,
    collaboratorId: string,
    actor?: any,
  ): Promise<{ newTemporaryPassword: string }> {
    const collaborator = await this.findOne(companyId, collaboratorId);

    const newPassword = this.credentialService.generateInitialPassword();
    collaborator.password = newPassword;
    collaborator.tokenVersion += 1;

    await this.collaboratorRepository.save(collaborator);

    this.activityLogService.log({
      companyId,
      actor,
      module: ActivityLogModule.COLLABORATORS,
      action: 'COLLABORATOR_CREDENTIALS_RESET',
      description: `Contraseña regenerada para el colaborador ${collaborator.firstName} ${collaborator.lastName}`,
      entityType: 'collaborator',
      entityId: collaborator.id,
    });

    return { newTemporaryPassword: newPassword };
  }

  /**
   * Eliminar colaborador de la empresa
   */
  async remove(
    companyId: string,
    collaboratorId: string,
    actor?: any,
  ): Promise<{ message: string }> {
    const collaborator = await this.findOne(companyId, collaboratorId);
    await this.collaboratorRepository.remove(collaborator);

    this.activityLogService.log({
      companyId,
      actor,
      module: ActivityLogModule.COLLABORATORS,
      action: 'COLLABORATOR_DELETED',
      description: `Colaborador ${collaborator.firstName} ${collaborator.lastName} eliminado del equipo`,
      entityType: 'collaborator',
      entityId: collaborator.id,
    });

    return { message: 'Colaborador eliminado exitosamente' };
  }
}
