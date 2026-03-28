import { BadRequestException, ForbiddenException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Like, Repository } from 'typeorm';
import { CreateStoreDto } from './dto/create-store.dto';
import { UpdateStoreDto } from './dto/update-store.dto';
import { Store } from './entities/store.entity';
import { StoreAddress } from 'src/store-address/entities/store-address.entity';
import { Subcategory } from 'src/subcategory/entities/subcategory.entity';
import { Company } from 'src/company/entities/company.entity';
import { Category } from 'src/category/entities/category.entity';
import { User } from 'src/user/entities/user.entity';
import { UserRole } from 'src/user/types/user-role.enum';
import { StorePaginationDto } from './dto/store-pagination.dto';

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
    private readonly dataSource: DataSource,
  ) { }

  async create(createStoreDto: CreateStoreDto, user: User) {
    const { companyId, subCategoryId, mainAddress, ...storeDetails } = createStoreDto;

    // Validar unicidad de RIF y teléfono
    await this.checkUniqueness(storeDetails.rif, storeDetails.phone, user, companyId);

    // Validación de rol VENDOR (una sola tienda)
    if (user.role === UserRole.VENDOR) {
      const existingStore = await this.storeRepository.findOne({
        where: { owner: { id: user.id } },
      });
      if (existingStore) {
        throw new ForbiddenException('Ya tienes una tienda registrada.');
      }
    }

    const subcategory = await this.subcategoryRepository.findOneBy({ id: subCategoryId });
    if (!subcategory) throw new NotFoundException(`Subcategoría no encontrada`);

    let company: Company | undefined;
    if (companyId) {
      company = await this.companyRepository.findOneBy({ id: companyId }) ?? undefined;
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
        await queryRunner.manager.update(User, user.id, { role: UserRole.VENDOR });
      }

      await queryRunner.commitTransaction();
      return savedStore;

    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.handleDBExceptions(error);
    } finally {
      await queryRunner.release();
    }
  }

  async findAll(paginationDto: StorePaginationDto) {
    const { 
      limit = 10, 
      offset = 0, 
      sort = 'name', 
      order = 'ASC', 
      categoryId,
      subCategoryId,
      city, 
      state, 
      q
    } = paginationDto;

    // Usamos QueryBuilder para manejar la lógica de múltiples direcciones
    const queryBuilder = this.storeRepository.createQueryBuilder('store')
      .leftJoinAndSelect('store.subcategory', 'subCategory')
      .leftJoinAndSelect('subCategory.category', 'category')
      .leftJoinAndSelect('store.owner', 'owner')
      .leftJoinAndSelect('store.addresses', 'address')
      .take(limit)
      .skip(offset);

    // Filtros
    if (subCategoryId) queryBuilder.andWhere('subCategory.id = :subCategoryId', { subCategoryId });
    if (categoryId) queryBuilder.andWhere('category.id = :categoryId', { categoryId });
    if (city) queryBuilder.andWhere('address.city ILIKE :city', { city: `%${city}%` });
    if (state) queryBuilder.andWhere('address.state ILIKE :state', { state: `%${state}%` });
    if (q) queryBuilder.andWhere('store.name ILIKE :q', { q: `%${q}%` });

    queryBuilder.orderBy(`store.${sort}`, order);

    const [data, total] = await queryBuilder.getManyAndCount();

    return {
      data,
      total,
      limit,
      offset
    };

    return {
      data,
      total,
      limit,
      offset
    };
  }

  async findOne(id: string) {
    const store = await this.storeRepository.findOne({
      where: { id },
      relations: ['company', 'subcategory', 'subcategory.category', 'owner', 'addresses']
    });

    if (!store) {
      throw new NotFoundException(`Tienda con ID ${id} no encontrada`);
    }

    return store;
  }

  async update(id: string, updateStoreDto: UpdateStoreDto, user: User) {
    const { companyId, subCategoryId, ...updateDetails } = updateStoreDto;
    const store = await this.findOne(id);

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

    if (companyId !== undefined) {
      if (companyId) {
        const company = await this.companyRepository.findOneBy({ id: companyId });
        if (!company) throw new NotFoundException(`Empresa con ID ${companyId} no encontrada`);
        store.company = company;
      } else {
        store.company = undefined;
      }
    }

    if (subCategoryId) {
      const subcategory = await this.subcategoryRepository.findOneBy({ id: subCategoryId });
      if (!subcategory) throw new NotFoundException(`Subcategoría con ID ${subCategoryId} no encontrada`);
      store.subcategory = subcategory;
    }

    this.storeRepository.merge(store, updateDetails);
    try {
      return await this.storeRepository.save(store);
    } catch (error) {
      this.handleDBExceptions(error);
    }
  }

  async remove(id: string) {
    const store = await this.findOne(id);
    await this.storeRepository.remove(store);
    return { deleted: true };
  }

  private handleDBExceptions(error: any): never {
    console.log(error);
    throw new InternalServerErrorException('Unexpected error, check server logs');
  }

  private async checkUniqueness(rif: string, phone: string, user: User, companyId?: string, excludeStoreId?: string): Promise<void> {
    // Verificar RIF
    const existingRifStore = await this.storeRepository.findOne({
      where: { rif },
      relations: ['company']
    });

    if (existingRifStore && existingRifStore.id !== excludeStoreId) {
      const isSameCompany = user.role === UserRole.COMPANY &&
        companyId &&
        existingRifStore.company?.id === companyId;

      if (!isSameCompany) {
        throw new BadRequestException('El RIF ya está registrado por otro ente');
      }
    }

    // Verificar Teléfono
    const existingPhoneStore = await this.storeRepository.findOne({
      where: { phone },
      relations: ['company']
    });

    if (existingPhoneStore && existingPhoneStore.id !== excludeStoreId) {
      const isSameCompany = user.role === UserRole.COMPANY &&
        companyId &&
        existingPhoneStore.company?.id === companyId;

      if (!isSameCompany) {
        throw new BadRequestException('El número de teléfono ya está registrado por otro ente');
      }
    }
  }
}
