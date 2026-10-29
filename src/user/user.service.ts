import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, MoreThanOrEqual } from 'typeorm';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UserPaginationDto } from './dto/user-pagination.dto';
import { User } from './entities/user.entity';
import { Company } from 'src/company/entities/company.entity';
import { Store } from 'src/store/entities/store.entity';
import { StoreStatus } from 'src/store/types/status.enum';
import { Order } from 'src/order/entities/order.entity';
import { AppOrigin } from 'src/auth/types/app-origin.enum';
import { UserRole } from './types/user-role.enum';
import { MediationRequest } from 'src/store/entities/mediation-request.entity';
import {
  SuspensionAppeal,
  AppealStatus,
} from './entities/suspension-appeal.entity';
import {
  UserSuspension,
  SuspensionType,
  SuspensionCaseStatus,
} from './entities/user-suspension.entity';
import { CreateSuspensionAppealDto } from './dto/create-suspension-appeal.dto';
import { ReviewSuspensionAppealDto } from './dto/review-suspension-appeal.dto';
import { ProvideAdditionalInfoAppealDto } from './dto/provide-additional-info-appeal.dto';
import { SuspendUserDto } from './dto/suspend-user.dto';
import { MailService } from 'src/common/mail/mail.service';
import { NotificationGateway } from 'src/notification/notification.gateway';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
    @InjectRepository(Store)
    private readonly storeRepository: Repository<Store>,
    @InjectRepository(MediationRequest)
    private readonly mediationRequestRepository: Repository<MediationRequest>,
    @InjectRepository(SuspensionAppeal)
    private readonly suspensionAppealRepository: Repository<SuspensionAppeal>,
    @InjectRepository(UserSuspension)
    private readonly userSuspensionRepository: Repository<UserSuspension>,
    @Inject(forwardRef(() => NotificationGateway))
    private readonly notificationGateway: NotificationGateway,
    private readonly dataSource: DataSource,
    private readonly mailService: MailService,
  ) {}

  async create(createUserDto: CreateUserDto) {
    const { companyId, storeId, appOrigin, ...userDetails } = createUserDto;

    const existingUser = await this.userRepository.findOne({
      where: { email: userDetails.email },
    });

    if (existingUser) {
      if (appOrigin === AppOrigin.CLIENT || appOrigin === AppOrigin.SELLER) {
        throw new BadRequestException('El correo ya está en uso.');
      }
      if (appOrigin === AppOrigin.BUSINESS) {
        if (existingUser.role === UserRole.VENDOR) {
          existingUser.role = UserRole.COMPANY;
        } else {
          throw new BadRequestException('El correo ya está en uso.');
        }
      }
    } else {
      if (!userDetails.role) {
        if (appOrigin === AppOrigin.CLIENT) userDetails.role = UserRole.USER;
        if (appOrigin === AppOrigin.SELLER) userDetails.role = UserRole.VENDOR;
        if (appOrigin === AppOrigin.BUSINESS)
          userDetails.role = UserRole.COMPANY;
      }
    }

    let company: Company | undefined;
    if (companyId) {
      company =
        (await this.companyRepository.findOneBy({ id: companyId })) ??
        undefined;
      if (!company)
        throw new NotFoundException(
          `Empresa con ID ${companyId} no encontrada`,
        );
    }

    let store: Store | undefined;
    if (storeId) {
      store =
        (await this.storeRepository.findOneBy({ id: storeId })) ?? undefined;
      if (!store)
        throw new NotFoundException(`Tienda con ID ${storeId} no encontrada`);
    }

    if (existingUser) {
      if (company) existingUser.company = company;
      if (store) existingUser.store = store;
      this.userRepository.merge(existingUser, userDetails);
      return await this.userRepository.save(existingUser);
    }

    const user = this.userRepository.create({
      ...userDetails,
      company,
      store,
    });

    return await this.userRepository.save(user);
  }

  async findAll(paginationDto?: UserPaginationDto) {
    const {
      limit = 50,
      offset = 0,
      role,
      search,
      sort = 'createdAt',
      order = 'DESC',
    } = paginationDto || {};

    const queryBuilder = this.userRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.addresses', 'addresses')
      .leftJoinAndSelect('user.company', 'company')
      .leftJoinAndSelect('user.store', 'store');

    if (role) {
      queryBuilder.andWhere('user.role = :role', { role });
    }

    if (search && search.trim().length > 0) {
      queryBuilder.andWhere(
        '(user.firstName ILIKE :search OR user.lastName ILIKE :search OR user.email ILIKE :search OR user.phone ILIKE :search)',
        { search: `%${search.trim()}%` },
      );
    }

    const validSortFields = [
      'createdAt',
      'firstName',
      'lastName',
      'email',
      'role',
      'isActive',
    ];
    const sortField = validSortFields.includes(sort)
      ? `user.${sort}`
      : 'user.createdAt';
    queryBuilder.orderBy(sortField, order);

    queryBuilder.skip(offset).take(limit);

    const [items, total] = await queryBuilder.getManyAndCount();

    return {
      items,
      total,
      limit,
      offset,
    };
  }

  async getPlatformMetrics() {
    const [
      totalUsers,
      totalClients,
      totalVendors,
      totalCompanies,
      totalAdmins,
    ] = await Promise.all([
      this.userRepository.count(),
      this.userRepository.count({ where: { role: UserRole.USER } }),
      this.userRepository.count({ where: { role: UserRole.VENDOR } }),
      this.userRepository.count({ where: { role: UserRole.COMPANY } }),
      this.userRepository.count({ where: { role: UserRole.ADMIN } }),
    ]);

    const [totalStores, activeStores, suspendedStores] = await Promise.all([
      this.storeRepository.count(),
      this.storeRepository.count({ where: { status: StoreStatus.ACTIVE } }),
      this.storeRepository.count({ where: { status: StoreStatus.SUSPENDED } }),
    ]);

    const orderRepo = this.dataSource.getRepository(Order);
    const totalOrders = await orderRepo.count();

    return {
      users: {
        total: totalUsers,
        clients: totalClients,
        vendors: totalVendors,
        companies: totalCompanies,
        admins: totalAdmins,
      },
      stores: {
        total: totalStores,
        active: activeStores,
        suspended: suspendedStores,
      },
      orders: {
        total: totalOrders,
      },
    };
  }

  async findOne(id: string) {
    const user = await this.userRepository.findOne({
      where: { id },
      relations: ['addresses', 'company', 'store'],
    });

    if (!user)
      throw new NotFoundException(`Usuario con ID ${id} no encontrado`);
    return user;
  }

  async update(id: string, updateUserDto: UpdateUserDto) {
    const { companyId, storeId, ...updateDetails } = updateUserDto;
    const user = await this.findOne(id);

    if (companyId !== undefined) {
      if (companyId) {
        const company =
          (await this.companyRepository.findOneBy({ id: companyId })) ??
          undefined;
        if (!company)
          throw new NotFoundException(
            `Empresa con ID ${companyId} no encontrada`,
          );
        user.company = company;
      } else {
        user.company = undefined;
      }
    }

    if (storeId !== undefined) {
      if (storeId) {
        const store =
          (await this.storeRepository.findOneBy({ id: storeId })) ?? undefined;
        if (!store)
          throw new NotFoundException(`Tienda con ID ${storeId} no encontrada`);
        user.store = store;
      } else {
        user.store = undefined;
      }
    }

    this.userRepository.merge(user, updateDetails);
    return await this.userRepository.save(user);
  }

  async remove(id: string) {
    const user = await this.findOne(id);
    await this.userRepository.remove(user);
    return { deleted: true };
  }

  async checkHasStore(userId: string) {
    if (!(await this.userRepository.findOneBy({ id: userId }))) {
      throw new NotFoundException(`Usuario con ID ${userId} no encontrado`);
    }

    const store = await this.storeRepository.findOne({
      where: { owner: { id: userId } },
      relations: ['subcategory', 'subcategory.category'],
    });

    return {
      hasStore: !!store,
      storeId: store?.id || null,
      storeName: store?.name || null,
      storeRif: store?.rif || null,
      storeLogo: store?.logo || null,
      subcategoryId: store?.subcategory?.id || null,
      subcategoryName: store?.subcategory?.name || null,
      categoryId: store?.subcategory?.category?.id || null,
      categoryName: store?.subcategory?.category?.name || null,
    };
  }

  async checkHasCompany(userId: string) {
    if (!(await this.userRepository.findOneBy({ id: userId }))) {
      throw new NotFoundException(`Usuario con ID ${userId} no encontrado`);
    }

    const company = await this.companyRepository.findOne({
      where: { owner: { id: userId } },
      relations: ['subcategory', 'subcategory.category'],
    });

    return {
      hasCompany: !!company,
      companyId: company?.id || null,
      companyName: company?.name || null,
      subcategoryId: company?.subcategory?.id || null,
      subcategoryName: company?.subcategory?.name || null,
      categoryId: company?.subcategory?.category?.id || null,
      categoryName: company?.subcategory?.category?.name || null,
    };
  }

  async updateProfile(userId: string, updateProfileDto: UpdateProfileDto) {
    const user = await this.findOne(userId);

    if (updateProfileDto.identification !== undefined) {
      user.identification = updateProfileDto.identification;
    }

    if (updateProfileDto.phone !== undefined) {
      user.phone = updateProfileDto.phone;
    }

    if (updateProfileDto.birthDate !== undefined) {
      user.birthDate = updateProfileDto.birthDate
        ? new Date(updateProfileDto.birthDate)
        : undefined;
    }

    return await this.userRepository.save(user);
  }

  async getMyMediations(customerId: string, storeId?: string) {
    const where: Record<string, any> = { customerId };
    if (storeId) where['storeId'] = storeId;

    const requests = await this.mediationRequestRepository.find({
      where,
      relations: ['store'],
      order: { createdAt: 'DESC' },
      select: {
        id: true,
        topic: true,
        message: true,
        status: true,
        storeResponse: true,
        storeId: true,
        createdAt: true,
        updatedAt: true,
        store: {
          id: true,
          name: true,
          logo: true,
        },
      },
    });

    return requests.map((req) => ({
      ...req,
      store: req.store
        ? {
            id: req.store.id,
            name: req.store.name,
            logo: req.store.logo,
            logoUrl: req.store.logo,
          }
        : null,
    }));
  }

  async suspendUser(id: string, dto: SuspendUserDto, adminId?: string) {
    const user = await this.userRepository.findOneBy({ id });
    if (!user) {
      throw new NotFoundException(`Usuario con ID ${id} no encontrado`);
    }

    const isPermanent = dto.type === 'PERMANENT';
    let suspendedUntilDate: Date | null = null;

    if (isPermanent) {
      user.isActive = false;
      user.accountSuspendedUntil = null;
      user.accountSuspensionReason = dto.reason.trim();
    } else {
      user.isActive = true;
      if (!dto.suspendedUntil) {
        throw new BadRequestException(
          'La fecha límite de suspensión es requerida para suspensiones temporales',
        );
      }
      suspendedUntilDate = new Date(dto.suspendedUntil);
      if (
        isNaN(suspendedUntilDate.getTime()) ||
        suspendedUntilDate <= new Date()
      ) {
        throw new BadRequestException(
          'La fecha límite de suspensión temporal debe ser una fecha futura válida',
        );
      }
      user.accountSuspendedUntil = suspendedUntilDate;
      user.accountSuspensionReason = dto.reason.trim();
    }

    // Si el usuario ya tenía una suspensión activa previa, marcarla como EXPIRED
    if (user.currentSuspensionId) {
      await this.userSuspensionRepository.update(
        { id: user.currentSuspensionId, status: SuspensionCaseStatus.ACTIVE },
        { status: SuspensionCaseStatus.EXPIRED },
      );
    }

    // Crear y persistir el nuevo caso de suspensión
    const suspension = this.userSuspensionRepository.create({
      userId: user.id,
      type: isPermanent ? SuspensionType.PERMANENT : SuspensionType.TEMPORARY,
      reason: dto.reason.trim(),
      suspendedUntil: isPermanent ? null : suspendedUntilDate,
      status: SuspensionCaseStatus.ACTIVE,
      createdById: adminId || null,
    });
    const savedSuspension = await this.userSuspensionRepository.save(suspension);

    user.currentSuspensionId = savedSuspension.id;
    const savedUser = await this.userRepository.save(user);

    // Desalojo en tiempo real vía WebSocket a la sala user_${savedUser.id}
    try {
      this.notificationGateway.evictSuspendedUser(savedUser.id, {
        suspensionId: savedSuspension.id,
        type: savedSuspension.type,
        reason: savedSuspension.reason,
        suspendedUntil: savedSuspension.suspendedUntil,
      });
    } catch (wsErr) {
      // Ignorar si el gateway no está listo
    }

    // Enviar notificación por correo de forma asíncrona y resiliente
    if (savedUser.email) {
      const userName =
        `${savedUser.firstName || ''} ${savedUser.lastName || ''}`.trim() ||
        'Usuario';
      this.mailService
        .sendAccountSuspensionNotice({
          toEmail: savedUser.email,
          userName,
          suspensionType: dto.type,
          reason: savedUser.accountSuspensionReason || dto.reason,
          suspendedUntil: savedUser.accountSuspendedUntil,
        })
        .catch(() => {});
    }

    return {
      message: isPermanent
        ? 'Cuenta suspendida permanentemente exitosamente.'
        : `Cuenta suspendida temporalmente hasta el ${new Date(savedUser.accountSuspendedUntil!).toLocaleString('es-VE')}.`,
      user: savedUser,
      suspension: savedSuspension,
    };
  }

  async liftSuspension(id: string, adminId?: string, reason?: string) {
    const user = await this.userRepository.findOneBy({ id });
    if (!user) {
      throw new NotFoundException(`Usuario con ID ${id} no encontrado`);
    }

    if (user.currentSuspensionId) {
      await this.userSuspensionRepository.update(
        { id: user.currentSuspensionId },
        {
          status: SuspensionCaseStatus.LIFTED,
          liftedAt: new Date(),
          liftedById: adminId || null,
          liftedReason: reason || 'Suspensión levantada administrativamente',
        },
      );
    }

    user.isActive = true;
    user.accountSuspendedUntil = null;
    user.accountSuspensionReason = null;
    user.currentSuspensionId = null;
    user.consecutiveRejectedPaymentsCount = 0;
    user.lastRejectedPaymentAt = null;
    user.consecutiveApprovedPaymentsCount = 0;

    await this.userRepository.save(user);

    return {
      message: 'Suspensión levantada y cuenta reactivada exitosamente.',
      user,
    };
  }

  async createAppeal(userId: string, dto: CreateSuspensionAppealDto) {
    const user = await this.userRepository.findOneBy({ id: userId });
    if (!user) {
      throw new NotFoundException('Usuario no encontrado.');
    }

    const isSuspended =
      !user.isActive ||
      (user.accountSuspendedUntil &&
        new Date(user.accountSuspendedUntil) > new Date());
    if (!isSuspended) {
      throw new BadRequestException('Tu cuenta no se encuentra suspendida.');
    }

    // Si por alguna razón histórica no tiene currentSuspensionId, vincular o crear uno
    if (!user.currentSuspensionId) {
      const activeSusp = await this.userSuspensionRepository.findOne({
        where: { userId, status: SuspensionCaseStatus.ACTIVE },
        order: { createdAt: 'DESC' },
      });
      if (activeSusp) {
        user.currentSuspensionId = activeSusp.id;
        await this.userRepository.save(user);
      } else {
        const newSusp = await this.userSuspensionRepository.save(
          this.userSuspensionRepository.create({
            userId,
            type: user.accountSuspendedUntil
              ? SuspensionType.TEMPORARY
              : SuspensionType.PERMANENT,
            reason:
              user.accountSuspensionReason || 'Suspensión activa en cuenta',
            suspendedUntil: user.accountSuspendedUntil,
            status: SuspensionCaseStatus.ACTIVE,
          }),
        );
        user.currentSuspensionId = newSusp.id;
        await this.userRepository.save(user);
      }
    }

    // Verificar si ya existen apelaciones para este caso disciplinario
    const appealsForCase = await this.suspensionAppealRepository.find({
      where: { suspensionId: user.currentSuspensionId },
      order: { createdAt: 'DESC' },
    });

    const activePendingOrMoreInfo = appealsForCase.find(
      (a) =>
        a.status === AppealStatus.PENDING ||
        a.status === AppealStatus.MORE_INFO_REQUESTED,
    );

    if (activePendingOrMoreInfo) {
      throw new BadRequestException(
        activePendingOrMoreInfo.status === AppealStatus.MORE_INFO_REQUESTED
          ? 'El equipo de soporte solicitó información adicional para tu caso. Por favor responde dicha solicitud.'
          : 'Ya tienes una apelación pendiente de revisión para este caso.',
      );
    }

    const latestRejected = appealsForCase.find(
      (a) => a.status === AppealStatus.REJECTED,
    );

    if (latestRejected && !latestRejected.allowReappeal) {
      throw new BadRequestException(
        'La apelación para esta sanción fue rechazada y no se admiten nuevas apelaciones. Por favor comunícate a través del canal oficial de WhatsApp.',
      );
    }

    const appeal = this.suspensionAppealRepository.create({
      userId,
      suspensionId: user.currentSuspensionId,
      reason: dto.reason,
      evidenceUrls: dto.evidenceUrls || [],
      contactPhone: dto.contactPhone || null,
      status: AppealStatus.PENDING,
    });

    return this.suspensionAppealRepository.save(appeal);
  }

  async getMyAppealStatus(userId: string) {
    const user = await this.userRepository.findOneBy({ id: userId });
    if (!user) {
      throw new NotFoundException('Usuario no encontrado.');
    }

    if (!user.currentSuspensionId) {
      const isSuspended =
        !user.isActive ||
        (user.accountSuspendedUntil &&
          new Date(user.accountSuspendedUntil) > new Date());

      if (!isSuspended) {
        const lastApprovedAppeal =
          await this.suspensionAppealRepository.findOne({
            where: {
              userId: user.id,
              status: AppealStatus.APPROVED,
            },
            order: { createdAt: 'DESC' },
            relations: ['suspension'],
          });

        if (lastApprovedAppeal) {
          return {
            appeal: lastApprovedAppeal,
            suspension: lastApprovedAppeal.suspension || null,
          };
        }
      }

      return { appeal: null, suspension: null };
    }

    const suspension = await this.userSuspensionRepository.findOneBy({
      id: user.currentSuspensionId,
    });

    if (!suspension) {
      return { appeal: null, suspension: null };
    }

    // Buscar apelación vinculada estrictamente al caso disciplinario actual y creada dentro de su vigencia
    const appeal = await this.suspensionAppealRepository.findOne({
      where: {
        suspensionId: user.currentSuspensionId,
        createdAt: MoreThanOrEqual(suspension.createdAt),
      },
      order: { createdAt: 'DESC' },
    });

    // Salvaguarda lógica: si la suspensión actual está ACTIVA, no puede tener una apelación APROBADA
    if (
      appeal &&
      suspension.status === SuspensionCaseStatus.ACTIVE &&
      appeal.status === AppealStatus.APPROVED
    ) {
      return { appeal: null, suspension };
    }

    return { appeal: appeal || null, suspension };
  }

  async getAllAppeals(status?: AppealStatus) {
    const where: any = {};
    if (status) {
      where.status = status;
    }

    return this.suspensionAppealRepository.find({
      where,
      relations: ['user', 'reviewedBy', 'suspension'],
      order: { createdAt: 'DESC' },
    });
  }

  async reviewAppeal(
    appealId: string,
    adminId: string,
    dto: ReviewSuspensionAppealDto,
  ) {
    const appeal = await this.suspensionAppealRepository.findOne({
      where: { id: appealId },
      relations: ['user', 'suspension'],
    });

    if (!appeal) {
      throw new NotFoundException(`Apelación con ID ${appealId} no encontrada.`);
    }

    if (
      appeal.status === AppealStatus.APPROVED ||
      appeal.status === AppealStatus.REJECTED
    ) {
      throw new BadRequestException(
        `Esta apelación ya fue resuelta previamente con estado ${appeal.status}.`,
      );
    }

    if (dto.status === AppealStatus.APPROVED) {
      await this.liftSuspension(
        appeal.userId,
        adminId,
        dto.adminNotes || 'Apelación aprobada',
      );
      appeal.status = AppealStatus.APPROVED;
      appeal.adminNotes = dto.adminNotes || null;
      appeal.reviewedById = adminId;
      appeal.reviewedAt = new Date();
      await this.suspensionAppealRepository.save(appeal);

      return {
        message: 'Apelación aprobada y suspensión levantada exitosamente.',
        appeal,
      };
    } else if (dto.status === AppealStatus.MORE_INFO_REQUESTED) {
      if (!dto.requestedInfo || dto.requestedInfo.trim().length === 0) {
        throw new BadRequestException(
          'Debes especificar qué información o documentación adicional solicitas al cliente.',
        );
      }
      appeal.status = AppealStatus.MORE_INFO_REQUESTED;
      appeal.requestedInfo = dto.requestedInfo.trim();
      appeal.adminNotes = dto.adminNotes ? dto.adminNotes.trim() : null;
      appeal.reviewedById = adminId;
      appeal.reviewedAt = new Date();
      await this.suspensionAppealRepository.save(appeal);

      return {
        message: 'Solicitud de información adicional enviada al usuario.',
        appeal,
      };
    } else if (dto.status === AppealStatus.REJECTED) {
      if (!dto.adminNotes || dto.adminNotes.trim().length === 0) {
        throw new BadRequestException(
          'Debes proporcionar una nota explicativa de rechazo para el usuario.',
        );
      }
      appeal.status = AppealStatus.REJECTED;
      appeal.adminNotes = dto.adminNotes.trim();
      appeal.allowReappeal = dto.allowReappeal ?? false;
      appeal.reviewedById = adminId;
      appeal.reviewedAt = new Date();
      await this.suspensionAppealRepository.save(appeal);

      return {
        message: 'Apelación rechazada y nota guardada.',
        appeal,
      };
    } else {
      throw new BadRequestException('Estado de revisión no válido.');
    }
  }

  async provideAdditionalInfo(
    userId: string,
    appealId: string,
    dto: ProvideAdditionalInfoAppealDto,
  ) {
    const appeal = await this.suspensionAppealRepository.findOne({
      where: { id: appealId, userId },
    });

    if (!appeal) {
      throw new NotFoundException('Apelación no encontrada.');
    }

    if (appeal.status !== AppealStatus.MORE_INFO_REQUESTED) {
      throw new BadRequestException(
        'Esta apelación no tiene una solicitud pendiente de información adicional.',
      );
    }

    appeal.additionalInfo = dto.additionalInfo.trim();
    if (dto.additionalEvidenceUrls && dto.additionalEvidenceUrls.length > 0) {
      appeal.additionalEvidenceUrls = [
        ...(appeal.additionalEvidenceUrls || []),
        ...dto.additionalEvidenceUrls,
      ];
    }
    appeal.status = AppealStatus.PENDING;
    await this.suspensionAppealRepository.save(appeal);

    return {
      message: 'Información adicional enviada exitosamente para revisión.',
      appeal,
    };
  }
}

