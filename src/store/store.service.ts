import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, In, MoreThan } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { CreateStoreDto } from './dto/create-store.dto';
import { UpdateStoreDto } from './dto/update-store.dto';
import { Store } from './entities/store.entity';
import { StoreStatus } from './types/status.enum';
import { StoreAddress } from 'src/store-address/entities/store-address.entity';
import { Subcategory } from 'src/subcategory/entities/subcategory.entity';
import { Company } from 'src/company/entities/company.entity';
import { Category } from 'src/category/entities/category.entity';
import { User, isUserAdult } from 'src/user/entities/user.entity';
import { UserRole } from 'src/user/types/user-role.enum';
import { StorePaginationDto } from './dto/store-pagination.dto';
import { Order } from 'src/order/entities/order.entity';
import { Item } from 'src/item/entities/item.entity';
import { StoreCategory } from 'src/store-category/entities/store-category.entity';
import { OrderStatus } from 'src/order/types';
import { StoreDashboardDto } from './dto/store-dashboard.dto';
import { FinancialOtp } from 'src/financial-auth/entities/financial-otp.entity';
import {
  CompanyActivityLog,
  ActivityLogModule,
} from 'src/company/entities/company-activity-log.entity';
import { Installment } from 'src/order/entities/installment.entity';
import { InstallmentStatus } from 'src/order/types';
import { OrderDispute } from 'src/order-dispute/entities/order-dispute.entity';
import { DisputeStatus } from 'src/order-dispute/types/dispute.enum';
import {
  getStartOfTodayInTimezone,
  formatTimeInTimezone,
} from 'src/common/utils/timezone.utils';

import { StoreCustomerBlock } from './entities/store-customer-block.entity';
import {
  MediationRequest,
  MediationStatus,
  MediationTopic,
} from './entities/mediation-request.entity';
import { StoreStrike } from './entities/store-strike.entity';
import { StorePaymentMethod } from 'src/store-payment-method/entities/store-payment-method.entity';
import { CommissionPaymentReport } from 'src/commission/entities/commission-payment-report.entity';
import { PaymentReportStatus } from 'src/commission/types';
import { CompanyPermission } from 'src/company/types/company-permission.enum';
import { BlockCustomerDto } from './dto/block-customer.dto';
import { CreateMediationRequestDto } from './dto/create-mediation-request.dto';
import { RespondMediationRequestDto } from './dto/respond-mediation-request.dto';
import { NotificationService } from 'src/notification/notification.service';
import { NotificationType } from 'src/notification/entities/notification.entity';
import { MailService } from 'src/common/mail/mail.service';
import { PlatformSettingsService } from 'src/platform-settings/platform-settings.service';
import { RankingService } from 'src/ranking/services/ranking.service';
import { RankingSettingsService } from 'src/ranking/services/ranking-settings.service';
import { normalizeDivision } from 'src/ranking/types/division.enum';
import { RankingEventType } from 'src/ranking/types';

@Injectable()
export class StoreService {
  constructor(
    @InjectRepository(Store)
    private readonly storeRepository: Repository<Store>,
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
    @InjectRepository(Category)
    private readonly categoryRepository: Repository<Category>,
    @InjectRepository(Subcategory)
    private readonly subcategoryRepository: Repository<Subcategory>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    @InjectRepository(Item)
    private readonly itemRepository: Repository<Item>,
    @InjectRepository(StoreCategory)
    private readonly storeCategoryRepository: Repository<StoreCategory>,
    @InjectRepository(StoreCustomerBlock)
    private readonly storeCustomerBlockRepository: Repository<StoreCustomerBlock>,
    @InjectRepository(MediationRequest)
    private readonly mediationRequestRepository: Repository<MediationRequest>,
    @InjectRepository(FinancialOtp)
    private readonly otpRepository: Repository<FinancialOtp>,
    @InjectRepository(CompanyActivityLog)
    private readonly activityLogRepository: Repository<CompanyActivityLog>,
    @InjectRepository(Installment)
    private readonly installmentRepository: Repository<Installment>,
    @InjectRepository(OrderDispute)
    private readonly disputeRepository: Repository<OrderDispute>,
    private readonly notificationService: NotificationService,
    private readonly mailService: MailService,
    private readonly dataSource: DataSource,
    private readonly platformSettings: PlatformSettingsService,
    private readonly rankingService: RankingService,
    private readonly rankingSettingsService: RankingSettingsService,
    @InjectRepository(StoreStrike)
    private readonly storeStrikeRepository: Repository<StoreStrike>,
    @InjectRepository(StorePaymentMethod)
    private readonly storePaymentMethodRepository: Repository<StorePaymentMethod>,
    @InjectRepository(CommissionPaymentReport)
    private readonly commissionPaymentReportRepository: Repository<CommissionPaymentReport>,
  ) {}

  async create(createStoreDto: CreateStoreDto, user: User) {
    const { companyId, subCategoryId, mainAddress, ...storeDetails } =
      createStoreDto;

    let company: Company | undefined;
    if (companyId) {
      company =
        (await this.companyRepository.findOne({
          where: { id: companyId },
          relations: ['subcategory'],
        })) ?? undefined;
    } else if (user.company) {
      company =
        (await this.companyRepository.findOne({
          where: { id: user.company.id },
          relations: ['subcategory'],
        })) ?? undefined;
    }

    const targetSubcategoryId = subCategoryId || company?.subcategory?.id;
    if (!targetSubcategoryId) {
      throw new BadRequestException(
        'Se requiere una subcategoría para la tienda o debe pertenecer a una empresa con rubro asignado',
      );
    }

    const subcategory = await this.subcategoryRepository.findOne({
      where: { id: targetSubcategoryId },
      relations: ['category'],
    });
    if (!subcategory) throw new NotFoundException(`Subcategoría no encontrada`);

    if (subcategory.isAgeRestricted || subcategory.category?.isAgeRestricted) {
      storeDetails.isAgeRestricted = true;
    }

    // Si pertenece a una empresa, heredamos su identidad (Nombre, RIF y Logo)
    if (company) {
      storeDetails.name = company.name;
      storeDetails.rif = company.rif;
      storeDetails.logo = company.logo;
    }

    // Validar unicidad de RIF y teléfono
    await this.checkUniqueness(
      storeDetails.rif,
      storeDetails.phone,
      user,
      company?.id,
    );

    // Validación de rol VENDOR (una sola tienda)
    if (user.role === UserRole.VENDOR) {
      const existingStore = await this.storeRepository.findOne({
        where: { owner: { id: user.id } },
      });
      if (existingStore) {
        throw new ForbiddenException('Ya tienes una tienda registrada.');
      }
    }

    // Iniciar Transacción para Store + Address
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const store = queryRunner.manager.create(Store, {
        ...storeDetails,
        subcategory,
        company,
        owner: user,
      });

      const savedStore = await queryRunner.manager.save(store);

      if (mainAddress) {
        const address = queryRunner.manager.create(StoreAddress, {
          ...mainAddress,
          isMain: true,
          store: savedStore,
        });
        await queryRunner.manager.save(address);
      }

      // Promover a VENDOR si era USER
      if (user.role === UserRole.USER) {
        await queryRunner.manager.update(User, user.id, {
          role: UserRole.VENDOR,
        });
      }

      await queryRunner.commitTransaction();

      // Inicializar ranking para la nueva tienda
      try {
        await this.rankingService.getOrCreateStoreRanking(savedStore.id);
        if (savedStore.logo && savedStore.description) {
          await this.rankingService.processEvent(
            savedStore.id,
            RankingEventType.PROFILE_COMPLETE,
          );
        }
      } catch (rankErr) {
        // Log gracefully
      }

      return savedStore;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.handleDBExceptions(error);
    } finally {
      await queryRunner.release();
    }
  }

  async findAll(paginationDto: StorePaginationDto, user?: User | null) {
    const {
      limit = 10,
      offset = 0,
      sort = 'name',
      order = 'ASC',
      categoryId,
      subCategoryId,
      city,
      state,
      q,
      withItems = false,
    } = paginationDto;

    // Usamos QueryBuilder para manejar la lógica de múltiples direcciones
    const queryBuilder = this.storeRepository
      .createQueryBuilder('store')
      .leftJoinAndSelect('store.subcategory', 'subCategory')
      .leftJoinAndSelect('subCategory.category', 'category')
      .leftJoinAndSelect('store.owner', 'owner')
      .leftJoinAndSelect('store.addresses', 'address')
      .leftJoinAndSelect('store.ranking', 'ranking')
      .leftJoinAndSelect('store.company', 'company')
      .take(limit)
      .skip(offset);

    // Si withItems es true, solo traer tiendas que tienen items
    if (withItems) {
      queryBuilder
        .innerJoin('store.items', 'item')
        .groupBy('store.id')
        .addGroupBy('subCategory.id')
        .addGroupBy('category.id')
        .addGroupBy('owner.id')
        .addGroupBy('address.id')
        .addGroupBy('ranking.id')
        .addGroupBy('company.id');
    }

    // Filtro estricto: Solo tiendas activas en consultas públicas de catálogo
    queryBuilder.andWhere('store.status = :activeStatus', {
      activeStatus: StoreStatus.ACTIVE,
    });

    // Control de edad: ocultar tiendas +18 para menores
    if (!isUserAdult(user)) {
      queryBuilder.andWhere('store.isAgeRestricted = false');
      queryBuilder.andWhere(
        '(subCategory.isAgeRestricted = false OR subCategory.id IS NULL)',
      );
      queryBuilder.andWhere(
        '(category.isAgeRestricted = false OR category.id IS NULL)',
      );
    }

    // Filtros
    if (subCategoryId)
      queryBuilder.andWhere('subCategory.id = :subCategoryId', {
        subCategoryId,
      });
    if (categoryId)
      queryBuilder.andWhere('category.id = :categoryId', { categoryId });
    if (city)
      queryBuilder.andWhere('address.city ILIKE :city', { city: `%${city}%` });
    if (state)
      queryBuilder.andWhere('address.state ILIKE :state', {
        state: `%${state}%`,
      });
    if (q) queryBuilder.andWhere('store.name ILIKE :q', { q: `%${q}%` });

    if (sort === 'ranking') {
      queryBuilder.orderBy(
        'ranking.currentPR',
        order === 'ASC' ? 'ASC' : 'DESC',
        'NULLS LAST',
      );
      queryBuilder.addOrderBy('store.name', 'ASC');
    } else if (q) {
      // Priorizar tiendas de mayor rango en resultados de búsqueda
      queryBuilder.orderBy('ranking.currentPR', 'DESC', 'NULLS LAST');
      queryBuilder.addOrderBy(`store.${sort}`, order);
    } else {
      queryBuilder.orderBy(`store.${sort}`, order);
      queryBuilder.addOrderBy('ranking.currentPR', 'DESC', 'NULLS LAST');
    }

    // Cuando usamos GROUP BY, necesitamos contar de forma diferente
    let total: number;
    let data: Store[];

    if (withItems) {
      // Primero obtenemos los datos
      data = await queryBuilder.getMany();

      // Para el total, creamos una query separada sin paginación ni GROUP BY
      const countQueryBuilder = this.storeRepository
        .createQueryBuilder('store')
        .innerJoin('store.items', 'item')
        .leftJoin('store.subcategory', 'subCategory')
        .leftJoin('subCategory.category', 'category')
        .leftJoin('store.addresses', 'address')
        .andWhere('store.status = :activeStatus', {
          activeStatus: StoreStatus.ACTIVE,
        });

      if (!isUserAdult(user)) {
        countQueryBuilder.andWhere('store.isAgeRestricted = false');
        countQueryBuilder.andWhere(
          '(subCategory.isAgeRestricted = false OR subCategory.id IS NULL)',
        );
        countQueryBuilder.andWhere(
          '(category.isAgeRestricted = false OR category.id IS NULL)',
        );
      }

      // Aplicamos los mismos filtros
      if (subCategoryId)
        countQueryBuilder.andWhere('subCategory.id = :subCategoryId', {
          subCategoryId,
        });
      if (categoryId)
        countQueryBuilder.andWhere('category.id = :categoryId', { categoryId });
      if (city)
        countQueryBuilder.andWhere('address.city ILIKE :city', {
          city: `%${city}%`,
        });
      if (state)
        countQueryBuilder.andWhere('address.state ILIKE :state', {
          state: `%${state}%`,
        });
      if (q) countQueryBuilder.andWhere('store.name ILIKE :q', { q: `%${q}%` });

      // Contamos tiendas distintas
      total = await countQueryBuilder
        .select('COUNT(DISTINCT store.id)', 'count')
        .getRawOne()
        .then((result) => parseInt(result.count));
    } else {
      // Sin GROUP BY, podemos usar getManyAndCount normalmente
      [data, total] = await queryBuilder.getManyAndCount();
    }

    await this.enrichStoresWithBranchStatus(data);
    await this.enrichStoresWithRankingAssets(data);

    return {
      data,
      total,
      limit,
      offset,
    };
  }

  async findOne(id: string, user?: User | null) {
    const store = await this.storeRepository.findOne({
      where: { id },
      relations: [
        'company',
        'subcategory',
        'subcategory.category',
        'owner',
        'addresses',
        'ranking',
        'aiSettings',
      ],
    });

    if (!store || store.isDeleted) {
      throw new NotFoundException(`Tienda con ID ${id} no encontrada`);
    }

    const isRestricted =
      store.isAgeRestricted ||
      store.subcategory?.isAgeRestricted ||
      store.subcategory?.category?.isAgeRestricted;

    if (isRestricted && !isUserAdult(user)) {
      throw new ForbiddenException({
        statusCode: HttpStatus.FORBIDDEN,
        message: 'Esta tienda está restringida a mayores de 18 años',
        code: 'AGE_RESTRICTED',
      });
    }

    if (store.company?.id) {
      const count = await this.storeRepository.count({
        where: { company: { id: store.company.id } },
      });
      store.hasMultipleBranches = count > 1;
      const globalAiEnabled =
        await this.platformSettings.isAiImageEnhancementEnabled();
      store.aiEnabled = Boolean(
        globalAiEnabled &&
          store.aiSettings?.isEnabled &&
          store.aiSettings?.apiKeyHint,
      );
    } else {
      store.hasMultipleBranches = false;
      store.aiEnabled = false;
    }

    delete store.aiSettings;

    store.productsCount = await this.itemRepository.count({
      where: { store: { id: store.id }, isDeleted: false },
    });

    await this.enrichStoresWithRankingAssets([store]);

    return store;
  }

  async findLatestWithItems(limit: number = 10, user?: User | null) {
    const queryBuilder = this.storeRepository
      .createQueryBuilder('store')
      .leftJoinAndSelect('store.subcategory', 'subcategory')
      .leftJoinAndSelect('subcategory.category', 'category')
      .leftJoinAndSelect('store.owner', 'owner')
      .leftJoinAndSelect('store.addresses', 'address')
      .leftJoinAndSelect('store.ranking', 'ranking')
      .leftJoinAndSelect('store.company', 'company')
      .innerJoin('store.items', 'item')
      .groupBy('store.id')
      .addGroupBy('subcategory.id')
      .addGroupBy('category.id')
      .addGroupBy('owner.id')
      .addGroupBy('address.id')
      .addGroupBy('ranking.id')
      .addGroupBy('company.id')
      .orderBy('store.createdAt', 'DESC')
      .limit(limit);

    if (!isUserAdult(user)) {
      queryBuilder.andWhere('store.isAgeRestricted = false');
    }

    const stores = await queryBuilder.getMany();
    await this.enrichStoresWithBranchStatus(stores);
    await this.enrichStoresWithRankingAssets(stores);
    return stores;
  }

  private async enrichStoresWithBranchStatus(
    stores: Store[],
  ): Promise<Store[]> {
    if (!stores || stores.length === 0) return stores;

    const companyIds = Array.from(
      new Set(
        stores
          .map((s) => s.company?.id)
          .filter((id): id is string => Boolean(id)),
      ),
    );

    if (companyIds.length === 0) {
      for (const store of stores) {
        store.hasMultipleBranches = false;
      }
      return stores;
    }

    const companyCounts = await this.storeRepository
      .createQueryBuilder('s')
      .select('s.companyId', 'companyId')
      .addSelect('COUNT(s.id)', 'count')
      .where('s.companyId IN (:...companyIds)', { companyIds })
      .groupBy('s.companyId')
      .getRawMany<{ companyId: string; count: string }>();

    const countMap = new Map(
      companyCounts.map((c) => [c.companyId, parseInt(c.count, 10)]),
    );

    for (const store of stores) {
      const count = store.company?.id
        ? (countMap.get(store.company.id) ?? 1)
        : 1;
      store.hasMultipleBranches = count > 1;
    }

    return stores;
  }

  private async enrichStoresWithRankingAssets(
    stores: Store[],
  ): Promise<Store[]> {
    if (!stores || stores.length === 0) return stores;

    try {
      const settings = await this.rankingSettingsService.getSettings();
      for (const store of stores) {
        if (store.ranking) {
          const normDiv = normalizeDivision(store.ranking.division);

          const emblemKey =
            normDiv in settings.divisionEmblems
              ? normDiv
              : store.ranking.division;
          const emblemUrl =
            settings.divisionEmblems[emblemKey] ||
            `/assets/ranking/emblems/${normDiv.toLowerCase()}.png`;

          (store.ranking as any).divisionEmblemUrl = emblemUrl;
        }
      }
    } catch {
      // Non-blocking fallback
    }

    return stores;
  }

  async update(id: string, updateStoreDto: UpdateStoreDto, user: User) {
    const { companyId, subCategoryId, ...updateDetails } = updateStoreDto;
    const store = await this.findOne(id);

    // Si la tienda pertenece a una empresa, no se puede cambiar nombre, RIF ni Logo (se heredan)
    if (store.company) {
      delete (updateDetails as any).name;
      delete (updateDetails as any).rif;
      delete (updateDetails as any).logo;
    }

    // Validar unicidad si se están actualizando rif o teléfono
    if (updateDetails.rif || updateDetails.phone) {
      await this.checkUniqueness(
        updateDetails.rif ?? store.rif,
        updateDetails.phone ?? store.phone,
        user,
        companyId ?? store.company?.id,
        id,
      );
    }

    // Validación de reglas de negocio para pagos parciales
    const allowPartialPayments =
      updateDetails.allowPartialPayments !== undefined
        ? updateDetails.allowPartialPayments
        : store.allowPartialPayments;

    if (allowPartialPayments) {
      const maxInstallments =
        updateDetails.maxInstallments !== undefined
          ? updateDetails.maxInstallments
          : store.maxInstallments;

      if (maxInstallments < 2 || maxInstallments > 12) {
        throw new BadRequestException(
          'El número de cuotas para pagos parciales debe estar entre 2 y 12',
        );
      }

      const frequencyOptions =
        updateDetails.installmentFrequencyOptions !== undefined
          ? updateDetails.installmentFrequencyOptions
          : store.installmentFrequencyOptions;

      if (!frequencyOptions || frequencyOptions.length === 0) {
        throw new BadRequestException(
          'Debe seleccionar al menos una frecuencia de cuotas para habilitar los pagos parciales',
        );
      }
    }

    if (companyId !== undefined) {
      if (companyId) {
        const company = await this.companyRepository.findOneBy({
          id: companyId,
        });
        if (!company)
          throw new NotFoundException(
            `Empresa con ID ${companyId} no encontrada`,
          );
        store.company = company;
      } else {
        store.company = undefined;
      }
    }

    if (subCategoryId) {
      const subcategory = await this.subcategoryRepository.findOne({
        where: { id: subCategoryId },
        relations: ['category'],
      });
      if (!subcategory)
        throw new NotFoundException(
          `Subcategoría con ID ${subCategoryId} no encontrada`,
        );
      store.subcategory = subcategory;
    }

    if (
      store.subcategory?.isAgeRestricted ||
      store.subcategory?.category?.isAgeRestricted
    ) {
      updateDetails.isAgeRestricted = true;
    }

    this.storeRepository.merge(store, updateDetails);
    try {
      const saved = await this.storeRepository.save(store);
      // Hook Ranking: Perfil completo
      if (saved.logo && saved.description) {
        try {
          await this.rankingService.processEvent(
            saved.id,
            RankingEventType.PROFILE_COMPLETE,
          );
        } catch (rankErr) {
          // Log gracefully
        }
      }
      return saved;
    } catch (error) {
      this.handleDBExceptions(error);
    }
  }

  async remove(id: string) {
    return this.executeSoftDeleteStore(id);
  }

  /**
   * Valida que el usuario sea el Propietario de la Empresa o un Colaborador con rol administrativo / permiso de sucursales.
   */
  async assertBranchAdminAccess(storeId: string, user: User): Promise<Store> {
    const store = await this.storeRepository.findOne({
      where: { id: storeId },
      relations: ['company', 'company.owner', 'owner'],
    });

    if (!store) {
      throw new NotFoundException(`Sucursal no encontrada`);
    }

    if (store.isDeleted) {
      throw new BadRequestException('Esta sucursal ha sido eliminada previamente');
    }

    // 1. Super Administradores de la plataforma
    if (user.role === UserRole.ADMIN) {
      return store;
    }

    // 2. Propietario directo de la tienda o propietario de la empresa
    const isStoreOwner = store.owner?.id === user.id;
    const isCompanyOwner = store.company?.owner?.id === user.id;

    // 3. Colaborador con rol administrativo o permiso de gestión de sucursales
    const actor = user as any;
    const isCollaboratorAdmin =
      actor.isCollaborator &&
      (actor.collaboratorRole?.toLowerCase() === 'administrador' ||
        (actor.permissions || []).includes('branches:manage'));

    if (isStoreOwner || isCompanyOwner || isCollaboratorAdmin) {
      return store;
    }

    throw new ForbiddenException(
      'Solo el propietario de la empresa o un colaborador con rol administrativo puede gestionar el ciclo de vida de esta sucursal.',
    );
  }

  /**
   * Realiza validaciones pre-vuelo (candados): órdenes en curso, disputas abiertas, cuotas pendientes.
   */
  async validateLifecyclePreflight(storeId: string, user: User) {
    const store = await this.assertBranchAdminAccess(storeId, user);
    const blockers: string[] = [];

    // 1. Órdenes activas (PENDING, PARTIALLY_PAID)
    const activeOrdersCount = await this.orderRepository.count({
      where: {
        store: { id: storeId },
        status: In([OrderStatus.PENDING, OrderStatus.PARTIALLY_PAID]),
      },
    });

    if (activeOrdersCount > 0) {
      blockers.push(
        `Tiene ${activeOrdersCount} orden(es) activa(s) en proceso o pendientes de pago/entrega. Debe completarlas o cancelarlas primero.`,
      );
    }

    // 2. Reclamos o disputas abiertas
    const openDisputesCount = await this.disputeRepository
      .createQueryBuilder('dispute')
      .innerJoin('dispute.order', 'order')
      .where('order.storeId = :storeId', { storeId })
      .andWhere('dispute.status IN (:...statuses)', {
        statuses: [
          DisputeStatus.OPEN,
          DisputeStatus.ADMIN_REVIEW,
          DisputeStatus.MERCHANT_RESPONDED,
        ],
      })
      .getCount();

    if (openDisputesCount > 0) {
      blockers.push(
        `Tiene ${openDisputesCount} reclamo(s) o mediación(es) abierta(s). Debe resolverlos antes de continuar.`,
      );
    }

    // 3. Cuotas activas pendientes de pago
    const pendingInstallmentsCount = await this.installmentRepository
      .createQueryBuilder('installment')
      .innerJoin('installment.order', 'order')
      .where('order.storeId = :storeId', { storeId })
      .andWhere('installment.status IN (:...statuses)', {
        statuses: [InstallmentStatus.PENDING, InstallmentStatus.OVERDUE],
      })
      .getCount();

    if (pendingInstallmentsCount > 0) {
      blockers.push(
        `Tiene ${pendingInstallmentsCount} cuota(s) pendiente(s) por cobrar asociadas a clientes en esta sede.`,
      );
    }

    // 4. Conteo de sucursales activas en la empresa
    let totalCompanyBranches = 1;
    let isLastBranch = false;
    if (store.company?.id) {
      totalCompanyBranches = await this.storeRepository.count({
        where: {
          company: { id: store.company.id },
          isDeleted: false,
          status: StoreStatus.ACTIVE,
        },
      });
      if (totalCompanyBranches <= 1 && store.status === StoreStatus.ACTIVE) {
        isLastBranch = true;
      }
    }

    return {
      canProceed: blockers.length === 0,
      blockers,
      details: {
        activeOrdersCount,
        openDisputesCount,
        pendingInstallmentsCount,
        isLastBranch,
        totalCompanyBranches,
        currentStatus: store.status,
        deletionScheduledAt: store.deletionScheduledAt,
      },
    };
  }

  /**
   * Genera y envía código OTP para pausar o programar la eliminación de la sucursal.
   */
  async requestLifecycleOtp(
    storeId: string,
    actionType: 'DEACTIVATE' | 'SCHEDULE_DELETION',
    user: User,
  ) {
    const preflight = await this.validateLifecyclePreflight(storeId, user);
    if (!preflight.canProceed) {
      throw new ConflictException({
        message: 'No es posible proceder debido a dependencias activas.',
        blockers: preflight.blockers,
      });
    }

    const store = await this.assertBranchAdminAccess(storeId, user);

    const targetEmail =
      store.company?.owner?.email || store.owner?.email || user.email;
    const adminName =
      `${user.firstName || ''} ${user.lastName || ''}`.trim() ||
      'Administrador';

    // Invalidar OTPs previos
    await this.otpRepository.update(
      { email: targetEmail, isUsed: false },
      { isUsed: true },
    );

    // Generar OTP de 6 dígitos
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const codeHash = bcrypt.hashSync(code, 10);

    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 10);

    const otpRecord = this.otpRepository.create({
      email: targetEmail,
      codeHash,
      expiresAt,
      isUsed: false,
    });
    await this.otpRepository.save(otpRecord);

    await this.mailService.sendBranchLifecycleOtpEmail(
      targetEmail,
      adminName,
      store.branchName || store.name,
      actionType,
      code,
    );

    return {
      success: true,
      message: `Código de verificación enviado al correo ${targetEmail}`,
      email: targetEmail,
      expiresAt,
    };
  }

  /**
   * Valida el código OTP recibido.
   */
  private async validateOtpCode(
    email: string,
    otpCode: string,
  ): Promise<FinancialOtp> {
    if (!otpCode || otpCode.trim().length !== 6) {
      throw new BadRequestException(
        'Se requiere un código de verificación de 6 dígitos',
      );
    }

    const activeOtp = await this.otpRepository.findOne({
      where: {
        email,
        isUsed: false,
        expiresAt: MoreThan(new Date()),
      },
      order: { createdAt: 'DESC' },
    });

    if (!activeOtp) {
      throw new BadRequestException('El código OTP ha expirado o no es válido');
    }

    const isValid = bcrypt.compareSync(otpCode.trim(), activeOtp.codeHash);
    if (!isValid) {
      throw new BadRequestException('Código OTP incorrecto');
    }

    activeOtp.isUsed = true;
    await this.otpRepository.save(activeOtp);
    return activeOtp;
  }

  /**
   * Desactiva temporalmente la sucursal previa confirmación de OTP.
   */
  async executeDeactivateBranch(storeId: string, otpCode: string, user: User) {
    const preflight = await this.validateLifecyclePreflight(storeId, user);
    if (!preflight.canProceed) {
      throw new ConflictException({
        message: 'No es posible desactivar la sucursal.',
        blockers: preflight.blockers,
      });
    }

    const store = await this.assertBranchAdminAccess(storeId, user);
    const targetEmail =
      store.company?.owner?.email || store.owner?.email || user.email;

    await this.validateOtpCode(targetEmail, otpCode);

    store.status = StoreStatus.INACTIVE;
    const updated = await this.storeRepository.save(store);

    await this.logStoreActivity(
      store,
      user,
      'BRANCH_DEACTIVATED',
      `Se desactivó la sucursal "${store.name} - ${store.branchName || 'Principal'}"`,
      { storeId: store.id, previousStatus: 'ACTIVE' },
    );

    return updated;
  }

  /**
   * Reactiva una sucursal inactiva o con eliminación cancelada.
   */
  async executeReactivateBranch(storeId: string, user: User) {
    const store = await this.assertBranchAdminAccess(storeId, user);

    store.status = StoreStatus.ACTIVE;
    store.deletionScheduledAt = null;
    const updated = await this.storeRepository.save(store);

    await this.logStoreActivity(
      store,
      user,
      'BRANCH_REACTIVATED',
      `Se reactivó la sucursal "${store.name} - ${store.branchName || 'Principal'}"`,
      { storeId: store.id },
    );

    return updated;
  }

  /**
   * Inicia el período de gracia de 7 días para la eliminación programada.
   */
  async executeScheduleBranchDeletion(
    storeId: string,
    otpCode: string,
    user: User,
  ) {
    const preflight = await this.validateLifecyclePreflight(storeId, user);
    if (!preflight.canProceed) {
      throw new ConflictException({
        message: 'No es posible programar la eliminación de la sucursal.',
        blockers: preflight.blockers,
      });
    }

    const store = await this.assertBranchAdminAccess(storeId, user);
    const targetEmail =
      store.company?.owner?.email || store.owner?.email || user.email;

    await this.validateOtpCode(targetEmail, otpCode);

    const scheduledDate = new Date();
    scheduledDate.setDate(scheduledDate.getDate() + 7);

    store.status = StoreStatus.INACTIVE;
    store.deletionScheduledAt = scheduledDate;
    const updated = await this.storeRepository.save(store);

    await this.logStoreActivity(
      store,
      user,
      'BRANCH_DELETION_SCHEDULED',
      `Se programó la eliminación de la sucursal "${store.name} - ${store.branchName || 'Principal'}" para el ${scheduledDate.toLocaleDateString()}`,
      {
        storeId: store.id,
        scheduledDate: scheduledDate.toISOString(),
      },
    );

    return updated;
  }

  /**
   * Cancela la eliminación programada dentro del período de gracia de 7 días.
   */
  async executeCancelScheduledDeletion(storeId: string, user: User) {
    const store = await this.assertBranchAdminAccess(storeId, user);

    if (!store.deletionScheduledAt) {
      throw new BadRequestException(
        'Esta sucursal no tiene una eliminación programada',
      );
    }

    store.deletionScheduledAt = null;
    store.status = StoreStatus.ACTIVE;
    const updated = await this.storeRepository.save(store);

    await this.logStoreActivity(
      store,
      user,
      'BRANCH_DELETION_CANCELLED',
      `Se canceló la eliminación programada de la sucursal "${store.name} - ${store.branchName || 'Principal'}". Sucursal reactivada.`,
      { storeId: store.id },
    );

    return updated;
  }

  /**
   * Ejecuta la baja lógica (soft delete) definitiva. Invocada por el cron a los 7 días.
   */
  async executeSoftDeleteStore(storeId: string): Promise<Store> {
    const store = await this.storeRepository.findOne({
      where: { id: storeId },
      relations: ['company'],
    });

    if (!store) {
      throw new NotFoundException(`Sucursal ${storeId} no encontrada`);
    }

    store.isDeleted = true;
    store.deletedAt = new Date();
    store.status = StoreStatus.CLOSED;
    store.slug = `${store.slug}-deleted-${Date.now()}`;
    const updated = await this.storeRepository.save(store);

    await this.logStoreActivity(
      store,
      null,
      'BRANCH_DELETED_PERMANENTLY',
      `Baja lógica definitiva ejecutada tras vencer los 7 días de gracia para la sucursal "${store.name} - ${store.branchName || 'Principal'}"`,
      {
        storeId: store.id,
        deletedAt: store.deletedAt.toISOString(),
      },
    );

    return updated;
  }

  /**
   * Helper para emitir logs en CompanyActivityLog.
   */
  private async logStoreActivity(
    store: Store,
    user: User | null,
    action: string,
    description: string,
    metadata?: Record<string, any>,
  ) {
    if (!store.company?.id) return;

    try {
      const actor = user as any;
      const isCollaborator = !!actor?.isCollaborator;
      const actorName = user
        ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Usuario'
        : 'Sistema Automático';
      const actorRoleName = isCollaborator
        ? actor.collaboratorRole || 'Colaborador'
        : user
          ? 'Propietario'
          : 'Cron';

      await this.activityLogRepository.save(
        this.activityLogRepository.create({
          companyId: store.company.id,
          storeId: store.id,
          actorType: isCollaborator ? 'COLLABORATOR' : 'OWNER',
          actorId: user?.id || store.company.id,
          actorName,
          actorRoleName,
          module: ActivityLogModule.STORE,
          action,
          description,
          metadata,
        }),
      );
    } catch (logErr) {
      // Ignorar fallas secundarias de logging para no bloquear la operación
    }
  }

  private resolveStoreDashboardPermissions(store: Store, actor: any): {
    canViewFinancial: boolean;
    canViewSalesHistory: boolean;
    canViewOrders: boolean;
    canViewDisputes: boolean;
    canViewStrikes: boolean;
    canViewMediations: boolean;
    canViewCustomerData: boolean;
  } {
    if (!actor) {
      throw new ForbiddenException(
        'No tienes autorización para consultar el panel de esta sucursal',
      );
    }

    const isCollaborator = Boolean(actor.isCollaborator);
    if (isCollaborator) {
      const actorCompanyId = actor.company?.id ?? actor.companyId;
      const storeCompanyId = store.company?.id;
      const sameCompany = Boolean(
        actorCompanyId && storeCompanyId && actorCompanyId === storeCompanyId,
      );
      const hasBranchAccess =
        Boolean(actor.hasFullBranchAccess) ||
        (Array.isArray(actor.allowedBranchIds) &&
          actor.allowedBranchIds.includes(store.id));

      if (!sameCompany || !hasBranchAccess) {
        throw new ForbiddenException(
          'No tienes autorización para consultar el panel de esta sucursal',
        );
      }

      const perms: string[] = Array.isArray(actor.permissions)
        ? actor.permissions
        : [];
      const canViewFinancial = perms.includes(
        CompanyPermission.METRICS_VIEW_FINANCIAL,
      );
      const canViewSalesHistory =
        canViewFinancial ||
        perms.includes(CompanyPermission.METRICS_VIEW_SALES_HISTORY);
      const canViewOrders =
        perms.includes(CompanyPermission.ORDERS_VIEW) ||
        perms.includes(CompanyPermission.ORDERS_PROCESS);
      const canViewDisputes =
        perms.includes(CompanyPermission.DISPUTES_VIEW) ||
        perms.includes(CompanyPermission.DISPUTES_RESPOND) ||
        perms.includes(CompanyPermission.DISPUTES_RESOLVE);
      const canManageBranches =
        actor.collaboratorRole?.toLowerCase?.() === 'administrador' ||
        perms.includes(CompanyPermission.BRANCHES_MANAGE);

      return {
        canViewFinancial,
        canViewSalesHistory,
        canViewOrders,
        canViewDisputes,
        canViewStrikes: canManageBranches || canViewOrders,
        canViewMediations: false,
        canViewCustomerData: perms.includes(
          CompanyPermission.ORDERS_VIEW_CUSTOMER_DATA,
        ),
      };
    }

    const isAdmin = actor.role === UserRole.ADMIN;
    const isStoreOwner = Boolean(store.owner?.id && store.owner.id === actor.id);
    const isCompanyOwner = Boolean(
      store.company?.owner?.id && store.company.owner.id === actor.id,
    );

    if (!isAdmin && !isStoreOwner && !isCompanyOwner) {
      throw new ForbiddenException(
        'No tienes autorización para consultar el panel de esta sucursal',
      );
    }

    return {
      canViewFinancial: true,
      canViewSalesHistory: true,
      canViewOrders: true,
      canViewDisputes: true,
      canViewStrikes: true,
      canViewMediations: true,
      canViewCustomerData: true,
    };
  }

  private buildOrderPreviewSummary(order: Order): {
    itemTitle: string;
    itemImageUrl: string | null;
  } {
    const firstItem = order.orderItems?.[0];
    const itemImageUrl = this.resolveOrderItemImageUrl(firstItem);
    const count = order.orderItems?.length || 0;
    const itemTitle =
      (firstItem?.title || firstItem?.item?.title || 'Producto') +
      (count > 1 ? ` (+${count - 1})` : '');
    return { itemTitle, itemImageUrl };
  }

  async getStoreDashboardData(
    storeId: string,
    actor: any,
  ): Promise<StoreDashboardDto> {
    const store = await this.storeRepository.findOne({
      where: { id: storeId },
      relations: ['company', 'company.owner', 'owner', 'aiSettings'],
    });

    if (!store || store.isDeleted) {
      throw new NotFoundException(`Tienda con ID ${storeId} no encontrada`);
    }

    const permissions = this.resolveStoreDashboardPermissions(store, actor);

    const now = new Date();
    const timezone = store.timezone || 'America/Caracas';
    const startOfToday = getStartOfTodayInTimezone(now, timezone);
    const startOfYesterday = new Date(startOfToday);
    startOfYesterday.setDate(startOfYesterday.getDate() - 1);

    const paidStatuses = [OrderStatus.FULLY_PAID, OrderStatus.PARTIALLY_PAID];
    const pendingStatuses = [OrderStatus.PENDING, OrderStatus.PARTIALLY_PAID];

    const [
      salesTodayRow,
      salesYesterdayRow,
      totalItems,
      totalCategories,
      totalCustomersRow,
      recentOrders,
      pendingOrdersCount,
      pendingOrdersEntities,
      openDisputesCount,
      pendingCommissionReportsCount,
      activeStrikesCount,
      pendingMediationRequestsCount,
      paymentMethodsCount,
      globalAiEnabled,
    ] = await Promise.all([
      permissions.canViewFinancial
        ? this.orderRepository
            .createQueryBuilder('order')
            .select('SUM(order.finalAmount)', 'total')
            .where('order.storeId = :storeId', { storeId })
            .andWhere('order.status IN (:...statuses)', {
              statuses: paidStatuses,
            })
            .andWhere('order.createdAt >= :startOfToday', {
              startOfToday: startOfToday.toISOString(),
            })
            .getRawOne()
        : Promise.resolve(null),
      permissions.canViewFinancial
        ? this.orderRepository
            .createQueryBuilder('order')
            .select('SUM(order.finalAmount)', 'total')
            .where('order.storeId = :storeId', { storeId })
            .andWhere('order.status IN (:...statuses)', {
              statuses: paidStatuses,
            })
            .andWhere(
              'order.createdAt >= :startOfYesterday AND order.createdAt < :startOfToday',
              {
                startOfYesterday: startOfYesterday.toISOString(),
                startOfToday: startOfToday.toISOString(),
              },
            )
            .getRawOne()
        : Promise.resolve(null),
      this.itemRepository.count({
        where: { store: { id: storeId }, isDeleted: false },
      }),
      this.storeCategoryRepository.count({
        where: { store: { id: storeId } },
      }),
      this.orderRepository
        .createQueryBuilder('order')
        .select('COUNT(DISTINCT order.userId)', 'total')
        .where('order.storeId = :storeId', { storeId })
        .andWhere('order.status IN (:...statuses)', {
          statuses: paidStatuses,
        })
        .getRawOne(),
      permissions.canViewSalesHistory
        ? this.orderRepository
            .createQueryBuilder('order')
            .leftJoinAndSelect('order.store', 'store')
            .leftJoinAndSelect('order.orderItems', 'orderItem')
            .leftJoinAndSelect('orderItem.variant', 'variant')
            .leftJoinAndSelect('orderItem.item', 'item')
            .leftJoinAndSelect('item.variants', 'itemVariants')
            .where('order.storeId = :storeId', { storeId })
            .andWhere('order.status IN (:...statuses)', {
              statuses: paidStatuses,
            })
            .orderBy('order.createdAt', 'DESC')
            .take(5)
            .getMany()
        : Promise.resolve([]),
      permissions.canViewOrders
        ? this.orderRepository.count({
            where: {
              store: { id: storeId },
              status: In(pendingStatuses),
            },
          })
        : Promise.resolve(0),
      permissions.canViewOrders
        ? this.orderRepository
            .createQueryBuilder('order')
            .leftJoinAndSelect('order.user', 'user')
            .leftJoinAndSelect('order.orderItems', 'orderItem')
            .leftJoinAndSelect('orderItem.variant', 'variant')
            .leftJoinAndSelect('orderItem.item', 'item')
            .leftJoinAndSelect('item.variants', 'itemVariants')
            .where('order.storeId = :storeId', { storeId })
            .andWhere('order.status IN (:...statuses)', {
              statuses: pendingStatuses,
            })
            .orderBy('order.createdAt', 'DESC')
            .take(5)
            .getMany()
        : Promise.resolve([]),
      permissions.canViewDisputes
        ? this.disputeRepository
            .createQueryBuilder('dispute')
            .innerJoin('dispute.order', 'order')
            .where('order.storeId = :storeId', { storeId })
            .andWhere('dispute.status IN (:...statuses)', {
              statuses: [
                DisputeStatus.OPEN,
                DisputeStatus.ADMIN_REVIEW,
                DisputeStatus.MERCHANT_RESPONDED,
              ],
            })
            .getCount()
        : Promise.resolve(0),
      permissions.canViewFinancial
        ? this.commissionPaymentReportRepository
            .createQueryBuilder('report')
            .innerJoin('report.billing', 'billing')
            .innerJoin('billing.store', 'store')
            .where('store.id = :storeId', { storeId })
            .andWhere('report.status = :status', {
              status: PaymentReportStatus.PENDING_REVIEW,
            })
            .getCount()
        : Promise.resolve(0),
      permissions.canViewStrikes
        ? this.storeStrikeRepository.count({
            where: {
              storeId,
              expiresAt: MoreThan(now),
              isRevoked: false,
            },
          })
        : Promise.resolve(0),
      permissions.canViewMediations
        ? this.mediationRequestRepository.count({
            where: {
              storeId,
              status: MediationStatus.PENDING,
            },
          })
        : Promise.resolve(0),
      this.storePaymentMethodRepository.count({
        where: {
          store: { id: storeId },
          isActive: true,
        },
      }),
      this.platformSettings.isAiImageEnhancementEnabled(),
    ]);

    const salesTodayAmount = permissions.canViewFinancial
      ? Math.round(parseFloat(salesTodayRow?.total || '0') * 100) / 100
      : 0;
    const salesYesterdayAmount = permissions.canViewFinancial
      ? parseFloat(salesYesterdayRow?.total || '0')
      : 0;
    const salesTodayPercentage =
      permissions.canViewFinancial && salesYesterdayAmount > 0
        ? Math.round(
            ((salesTodayAmount - salesYesterdayAmount) / salesYesterdayAmount) *
              1000,
          ) / 10
        : 0;

    const commissionDebt =
      permissions.canViewFinancial && !store.isCommissionExempt
        ? Math.round(
            parseFloat(store.accumulatedCommissionDebt?.toString() || '0') *
              100,
          ) / 100
        : 0;

    const aiEnabled = Boolean(
      globalAiEnabled &&
        store.aiSettings?.isEnabled &&
        store.aiSettings?.apiKeyHint,
    );

    const recentSales = recentOrders.map((order) => {
      const { itemTitle, itemImageUrl } = this.buildOrderPreviewSummary(order);
      return {
        id: order.id,
        storeName: order.store?.name || store.name || '',
        amount: permissions.canViewFinancial
          ? parseFloat(order.finalAmount.toString())
          : 0,
        currency: 'USD',
        time: formatTimeInTimezone(new Date(order.createdAt), timezone),
        orderId: order.id,
        status: order.status,
        itemTitle,
        itemImageUrl,
      };
    });

    const pendingOrders = pendingOrdersEntities.map((order) => {
      const { itemTitle, itemImageUrl } = this.buildOrderPreviewSummary(order);
      const customerName = permissions.canViewCustomerData
        ? `${order.user?.firstName || ''} ${order.user?.lastName || ''}`.trim() ||
          'Cliente'
        : 'Cliente';
      return {
        id: order.id,
        orderId: order.id,
        customerName,
        amount: permissions.canViewFinancial
          ? parseFloat(order.finalAmount.toString())
          : 0,
        currency: 'USD',
        time: formatTimeInTimezone(new Date(order.createdAt), timezone),
        status: order.status,
        itemTitle,
        itemImageUrl,
      };
    });

    return {
      stats: {
        salesToday: {
          amount: salesTodayAmount,
          percentage: salesTodayPercentage,
          currency: 'USD',
        },
        totalItems,
        totalCategories,
        totalCustomers: parseInt(totalCustomersRow?.total || '0', 10),
        pendingOrdersCount,
        openDisputesCount,
        commissionDebt,
        pendingCommissionReportsCount,
        activeStrikesCount,
        pendingMediationRequestsCount,
        paymentMethodsCount,
        aiEnabled,
      },
      recentSales,
      pendingOrders,
    };
  }

  private resolveOrderItemImageUrl(orderItem: any): string | null {
    if (!orderItem) return null;

    if (orderItem.variant?.imageUrl) {
      return orderItem.variant.imageUrl;
    }

    if (
      orderItem.variant?.axisValues &&
      typeof orderItem.variant.axisValues === 'object'
    ) {
      for (const val of Object.values(orderItem.variant.axisValues)) {
        if (typeof val === 'string') {
          const parts = val.split('|');
          for (const part of parts) {
            const trimmed = part.trim();
            if (
              trimmed.startsWith('http://') ||
              trimmed.startsWith('https://')
            ) {
              return trimmed;
            }
          }
        }
      }
    }

    if (orderItem.item?.variants && Array.isArray(orderItem.item.variants)) {
      const matchedVariant = orderItem.item.variants.find(
        (v: any) =>
          (orderItem.variantId && v.id === orderItem.variantId) ||
          (orderItem.variant?.id && v.id === orderItem.variant.id),
      );
      if (matchedVariant) {
        if (matchedVariant.imageUrl) {
          return matchedVariant.imageUrl;
        }
        if (
          matchedVariant.axisValues &&
          typeof matchedVariant.axisValues === 'object'
        ) {
          for (const val of Object.values(matchedVariant.axisValues)) {
            if (typeof val === 'string') {
              const parts = val.split('|');
              for (const part of parts) {
                const trimmed = part.trim();
                if (
                  trimmed.startsWith('http://') ||
                  trimmed.startsWith('https://')
                ) {
                  return trimmed;
                }
              }
            }
          }
        }
      }
    }

    if (orderItem.item?.mainImage) {
      return orderItem.item.mainImage;
    }
    if (
      Array.isArray(orderItem.item?.images) &&
      orderItem.item.images.length > 0
    ) {
      return orderItem.item.images[0];
    }

    return null;
  }

  private handleDBExceptions(error: any): never {
    console.log(error);
    throw new InternalServerErrorException(
      'Unexpected error, check server logs',
    );
  }

  private async checkUniqueness(
    rif: string,
    phone: string,
    user: User,
    companyId?: string,
    excludeStoreId?: string,
  ): Promise<void> {
    // Verificar RIF
    const existingRifStore = await this.storeRepository.findOne({
      where: { rif },
      relations: ['company'],
    });

    if (existingRifStore && existingRifStore.id !== excludeStoreId) {
      const isSameCompany =
        user.role === UserRole.COMPANY &&
        companyId &&
        existingRifStore.company?.id === companyId;

      if (!isSameCompany) {
        throw new BadRequestException(
          'El RIF ya está registrado por otro ente',
        );
      }
    }

    // Verificar Teléfono
    const existingPhoneStore = await this.storeRepository.findOne({
      where: { phone },
      relations: ['company'],
    });

    if (existingPhoneStore && existingPhoneStore.id !== excludeStoreId) {
      const isSameCompany =
        user.role === UserRole.COMPANY &&
        companyId &&
        existingPhoneStore.company?.id === companyId;

      if (!isSameCompany) {
        throw new BadRequestException(
          'El número de teléfono ya está registrado por otro ente',
        );
      }
    }
  }

  private checkStoreAdminOrOwner(store: Store, user: User) {
    if (user.role === UserRole.ADMIN) return;
    const isOwner =
      store.owner?.id === user.id || store.company?.owner?.id === user.id;
    if (!isOwner) {
      throw new ForbiddenException(
        'No tienes permiso para gestionar esta tienda',
      );
    }
  }

  async blockCustomerByEmailOrId(
    storeId: string,
    dto: BlockCustomerDto,
    user: User,
  ) {
    const store = await this.storeRepository.findOne({
      where: { id: storeId },
      relations: ['owner', 'company', 'company.owner'],
    });
    if (!store) throw new NotFoundException('Tienda no encontrada');
    this.checkStoreAdminOrOwner(store, user);

    let customer: User | null = null;
    const cleanEmail = dto.email ? dto.email.trim().toLowerCase() : '';
    const cleanCustomerId = dto.customerId ? dto.customerId.trim() : '';

    if (cleanEmail) {
      customer = await this.userRepository.findOne({
        where: { email: cleanEmail },
      });
      if (!customer) {
        throw new NotFoundException(
          `No existe ningún cliente registrado con el correo: ${cleanEmail}`,
        );
      }
    } else if (cleanCustomerId) {
      customer = await this.userRepository.findOneBy({ id: cleanCustomerId });
      if (!customer) {
        throw new NotFoundException('Cliente no encontrado');
      }
    } else {
      throw new BadRequestException(
        'Debes ingresar el correo electrónico del cliente para restringirlo',
      );
    }

    const customerId = customer.id;

    let block = await this.storeCustomerBlockRepository.findOne({
      where: { storeId, customerId },
    });

    if (block) {
      block.reason = dto.reason;
    } else {
      block = this.storeCustomerBlockRepository.create({
        storeId,
        customerId,
        reason: dto.reason,
      });
    }

    const savedBlock = await this.storeCustomerBlockRepository.save(block);

    // Enviar notificación Push + in-app al cliente explicando el motivo
    try {
      await this.notificationService.create({
        userId: customerId,
        storeId,
        title: 'Acceso a compras restringido',
        body: `La tienda "${store.name}" ha restringido las compras para tu cuenta. Motivo: ${dto.reason}`,
        type: NotificationType.CUSTOMER_BLOCKED,
        targetId: storeId,
      });
    } catch (e) {
      // Notificación opcional si falla socket
    }

    // Enviar correo transaccional aclaratorio al cliente
    if (customer.email) {
      const customerName =
        `${customer.firstName || ''} ${customer.lastName || ''}`.trim() ||
        'Cliente';
      this.mailService
        .sendCustomerBlockedNotice({
          toEmail: customer.email,
          customerName,
          storeName: store.name,
          reason: dto.reason,
        })
        .catch(() => {});
    }

    return savedBlock;
  }

  async blockCustomer(
    storeId: string,
    customerId: string,
    dto: BlockCustomerDto,
    user: User,
  ) {
    return this.blockCustomerByEmailOrId(storeId, { ...dto, customerId }, user);
  }

  async unblockCustomer(storeId: string, customerId: string, user: User) {
    const store = await this.storeRepository.findOne({
      where: { id: storeId },
      relations: ['owner', 'company', 'company.owner'],
    });
    if (!store) throw new NotFoundException('Tienda no encontrada');
    this.checkStoreAdminOrOwner(store, user);

    const block = await this.storeCustomerBlockRepository.findOne({
      where: { storeId, customerId },
    });
    if (!block) {
      throw new NotFoundException(
        'El cliente no está bloqueado por esta tienda',
      );
    }

    const customer = await this.userRepository.findOneBy({ id: customerId });

    await this.storeCustomerBlockRepository.remove(block);

    // Notificación Push + in-app al cliente
    try {
      await this.notificationService.create({
        userId: customerId,
        storeId,
        title: 'Acceso a compras restablecido',
        body: `La tienda "${store.name}" ha restablecido tu acceso para realizar compras.`,
        type: NotificationType.CUSTOMER_UNBLOCKED,
        targetId: storeId,
      });
    } catch (e) {}

    // Enviar correo transaccional de confirmación
    if (customer?.email) {
      const customerName =
        `${customer.firstName || ''} ${customer.lastName || ''}`.trim() ||
        'Cliente';
      this.mailService
        .sendCustomerUnblockedNotice({
          toEmail: customer.email,
          customerName,
          storeName: store.name,
        })
        .catch(() => {});
    }

    return { success: true, message: 'Cliente desbloqueado exitosamente' };
  }

  async getBlockedCustomers(storeId: string, user: User) {
    const store = await this.storeRepository.findOne({
      where: { id: storeId },
      relations: ['owner', 'company', 'company.owner'],
    });
    if (!store) throw new NotFoundException('Tienda no encontrada');
    this.checkStoreAdminOrOwner(store, user);

    return this.storeCustomerBlockRepository.find({
      where: { storeId },
      relations: ['customer'],
      order: { createdAt: 'DESC' },
    });
  }

  async isCustomerBlocked(storeId: string, customerId: string) {
    const block = await this.storeCustomerBlockRepository.findOne({
      where: { storeId, customerId },
    });
    return {
      isBlocked: !!block,
      reason: block?.reason || null,
    };
  }

  async createMediationRequest(
    storeId: string,
    customerId: string,
    dto: CreateMediationRequestDto,
  ) {
    const block = await this.storeCustomerBlockRepository.findOne({
      where: { storeId, customerId },
    });
    if (!block) {
      throw new BadRequestException(
        'Solo los clientes bloqueados pueden enviar solicitudes de mediación',
      );
    }

    const store = await this.storeRepository.findOne({
      where: { id: storeId },
      relations: ['owner', 'company', 'company.owner'],
    });
    if (!store) throw new NotFoundException('Tienda no encontrada');

    // Guard: no duplicates — reject if PENDING already exists
    const pendingExists = await this.mediationRequestRepository.findOne({
      where: { storeId, customerId, status: MediationStatus.PENDING },
    });
    if (pendingExists) {
      throw new ConflictException(
        'Ya tienes una solicitud de mediación pendiente con esta tienda. Espera la respuesta antes de enviar otra.',
      );
    }

    // Guard: cooldown — reject if last REJECTED was too recent
    const lastRejected = await this.mediationRequestRepository.findOne({
      where: { storeId, customerId, status: MediationStatus.REJECTED },
      order: { updatedAt: 'DESC' },
    });
    if (lastRejected) {
      const cooldownDays = await this.platformSettings.getCooldownDays();
      const daysSince =
        (Date.now() - new Date(lastRejected.updatedAt).getTime()) /
        (1000 * 60 * 60 * 24);
      if (daysSince < cooldownDays) {
        const daysLeft = Math.ceil(cooldownDays - daysSince);
        throw new HttpException(
          {
            statusCode: HttpStatus.TOO_MANY_REQUESTS,
            message: `Tu solicitud fue rechazada recientemente. Puedes reenviar en ${daysLeft} día${daysLeft === 1 ? '' : 's'}.`,
            daysLeft,
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }

    const mediation = this.mediationRequestRepository.create({
      storeId,
      customerId,
      topic: dto.topic,
      message: dto.message,
      attachmentUrl: dto.attachmentUrl,
      status: MediationStatus.PENDING,
    });

    const saved = await this.mediationRequestRepository.save(mediation);

    // Notificar al dueño de la tienda con texto amigable
    const ownerId = store.owner?.id || store.company?.owner?.id;
    if (ownerId) {
      const topicLabels: Record<string, string> = {
        [MediationTopic.ACCOUNT_REACTIVATION]: 'Reactivación de compras',
        [MediationTopic.SETTLE_DEBT]: 'Acuerdo de saldo pendiente',
        [MediationTopic.CLARIFY_MISUNDERSTANDING]:
          'Aclaratoria de malentendido',
        [MediationTopic.OTHER]: 'Consulta general',
      };
      const friendlyTopic = topicLabels[dto.topic] || 'Reactivación de compras';

      try {
        await this.notificationService.create({
          userId: ownerId,
          storeId,
          title: 'Nueva solicitud de mediación',
          body: `Un cliente ha enviado una solicitud de mediación: ${friendlyTopic}.`,
          type: NotificationType.MEDIATION_REQUEST,
          targetId: saved.id,
        });
      } catch (e) {}
    }

    return saved;
  }

  async getMediationRequests(storeId: string, user: User) {
    const store = await this.storeRepository.findOne({
      where: { id: storeId },
      relations: ['owner', 'company', 'company.owner'],
    });
    if (!store) throw new NotFoundException('Tienda no encontrada');
    this.checkStoreAdminOrOwner(store, user);

    return this.mediationRequestRepository.find({
      where: { storeId },
      relations: ['customer'],
      order: { createdAt: 'DESC' },
    });
  }

  async respondMediationRequest(
    storeId: string,
    requestId: string,
    dto: RespondMediationRequestDto,
    user: User,
  ) {
    const store = await this.storeRepository.findOne({
      where: { id: storeId },
      relations: ['owner', 'company', 'company.owner'],
    });
    if (!store) throw new NotFoundException('Tienda no encontrada');
    this.checkStoreAdminOrOwner(store, user);

    const mediation = await this.mediationRequestRepository.findOne({
      where: { id: requestId, storeId },
      relations: ['customer'],
    });
    if (!mediation) {
      throw new NotFoundException('Solicitud de mediación no encontrada');
    }

    mediation.status = dto.status;
    mediation.storeResponse = dto.storeResponse;
    const saved = await this.mediationRequestRepository.save(mediation);

    // Si se aceptó la mediación, desbloquear al cliente automáticamente
    if (dto.status === MediationStatus.ACCEPTED) {
      await this.storeCustomerBlockRepository.delete({
        storeId,
        customerId: mediation.customerId,
      });
    }

    // Notificar al cliente la resolución
    const statusText =
      dto.status === MediationStatus.ACCEPTED ? 'aceptada' : 'rechazada';
    try {
      await this.notificationService.create({
        userId: mediation.customerId,
        title: `Solicitud de mediación ${statusText}`,
        body: `La tienda "${store.name}" ha ${statusText} tu solicitud de mediación.${
          dto.storeResponse ? ' Mensaje: ' + dto.storeResponse : ''
        }`,
        type: NotificationType.MEDIATION_RESPONSE,
        targetId: storeId,
        storeId: storeId,
      });
    } catch (e) {}

    return saved;
  }
}
