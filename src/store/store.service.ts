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
import { DataSource, Repository } from 'typeorm';
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
    private readonly notificationService: NotificationService,
    private readonly mailService: MailService,
    private readonly dataSource: DataSource,
    private readonly platformSettings: PlatformSettingsService,
    private readonly rankingService: RankingService,
    private readonly rankingSettingsService: RankingSettingsService,
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

  async findAll(paginationDto: StorePaginationDto, user?: User) {
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

  async findOne(id: string, user?: User) {
    const store = await this.storeRepository.findOne({
      where: { id },
      relations: [
        'company',
        'subcategory',
        'subcategory.category',
        'owner',
        'addresses',
        'ranking',
      ],
    });

    if (!store) {
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
    } else {
      store.hasMultipleBranches = false;
    }

    store.productsCount = await this.itemRepository.count({
      where: { store: { id: store.id } },
    });

    await this.enrichStoresWithRankingAssets([store]);

    return store;
  }

  async findLatestWithItems(limit: number = 10, user?: User) {
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
          const frameKey =
            settings.divisionFrames && normDiv in settings.divisionFrames
              ? normDiv
              : store.ranking.division;
          const frameUrl =
            (settings.divisionFrames && settings.divisionFrames[frameKey]) ||
            `/assets/ranking/frames/${normDiv.toLowerCase()}.png`;

          const emblemKey =
            normDiv in settings.divisionEmblems
              ? normDiv
              : store.ranking.division;
          const emblemUrl =
            settings.divisionEmblems[emblemKey] ||
            `/assets/ranking/emblems/${normDiv.toLowerCase()}.png`;

          (store.ranking as any).divisionFrameUrl = frameUrl;
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
    const store = await this.findOne(id);
    await this.storeRepository.remove(store);
    return { deleted: true };
  }

  async getStoreDashboardData(storeId: string): Promise<StoreDashboardDto> {
    const store = await this.storeRepository.findOne({
      where: { id: storeId },
    });
    const timezone = store?.timezone || 'America/Caracas';
    const startOfToday = getStartOfTodayInTimezone(new Date(), timezone);

    // 1. Sales today
    const salesToday = await this.orderRepository
      .createQueryBuilder('order')
      .select('SUM(order.finalAmount)', 'total')
      .where('order.storeId = :storeId', { storeId })
      .andWhere('order.status IN (:...statuses)', {
        statuses: [OrderStatus.FULLY_PAID, OrderStatus.PARTIALLY_PAID],
      })
      .andWhere('order.createdAt >= :startOfToday', {
        startOfToday: startOfToday.toISOString(),
      })
      .getRawOne();

    // 2. Total items
    const totalItems = await this.itemRepository.count({
      where: { store: { id: storeId } },
    });

    // 3. Total categories
    const totalCategories = await this.storeCategoryRepository.count({
      where: { store: { id: storeId } },
    });

    // 4. Total customers (unique users who purchased)
    const totalCustomersQuery = await this.orderRepository
      .createQueryBuilder('order')
      .select('COUNT(DISTINCT order.userId)', 'total')
      .where('order.storeId = :storeId', { storeId })
      .andWhere('order.status IN (:...statuses)', {
        statuses: [OrderStatus.FULLY_PAID, OrderStatus.PARTIALLY_PAID],
      })
      .getRawOne();

    // 5. Recent sales
    const orders = await this.orderRepository
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.store', 'store')
      .leftJoinAndSelect('order.orderItems', 'orderItem')
      .leftJoinAndSelect('orderItem.variant', 'variant')
      .leftJoinAndSelect('orderItem.item', 'item')
      .leftJoinAndSelect('item.variants', 'itemVariants')
      .where('order.storeId = :storeId', { storeId })
      .andWhere('order.status IN (:...statuses)', {
        statuses: [OrderStatus.FULLY_PAID, OrderStatus.PARTIALLY_PAID],
      })
      .orderBy('order.createdAt', 'DESC')
      .take(5)
      .getMany();

    const recentSales = orders.map((order) => {
      const firstItem = order.orderItems?.[0];
      const itemImageUrl = this.resolveOrderItemImageUrl(firstItem);
      const count = order.orderItems?.length || 0;
      const itemTitle =
        (firstItem?.title || firstItem?.item?.title || 'Producto') +
        (count > 1 ? ` (+${count - 1})` : '');

      return {
        id: order.id,
        storeName: order.store?.name || '',
        amount: parseFloat(order.finalAmount.toString()),
        currency: 'USD',
        time: formatTimeInTimezone(new Date(order.createdAt), timezone),
        orderId: order.id,
        status: order.status,
        itemTitle,
        itemImageUrl,
      };
    });

    return {
      stats: {
        salesToday: {
          amount: parseFloat(salesToday?.total || '0'),
          currency: 'USD',
        },
        totalItems,
        totalCategories,
        totalCustomers: parseInt(totalCustomersQuery?.total || '0'),
      },
      recentSales,
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
