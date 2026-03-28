import { BadRequestException, ForbiddenException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Like, Repository } from 'typeorm';
import { CreateStoreDto } from './dto/create-store.dto';
import { UpdateStoreDto } from './dto/update-store.dto';
import { Store } from './entities/store.entity';
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
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) { }

  async create(createStoreDto: CreateStoreDto, user: User) {
    const { companyId, categoryId, ...storeDetails } = createStoreDto;

    // Validar unicidad de RIF y teléfono programáticamente
    await this.checkUniqueness(storeDetails.rif, storeDetails.phone, user, companyId);

    // Si el usuario es VENDOR y ya tiene una tienda, no se le permite crear otra
    if (user.role === UserRole.VENDOR) {
      const existingStore = await this.storeRepository.findOne({
        where: { owner: { id: user.id } },
      });
      if (existingStore) {
        throw new ForbiddenException('Ya tienes una tienda registrada. Solo los usuarios con rol COMPANY pueden tener más de una tienda.');
      }
    }

    let company: Company | undefined;
    if (companyId) {
      company = await this.companyRepository.findOneBy({ id: companyId }) ?? undefined;
      if (!company) throw new NotFoundException(`Empresa con ID ${companyId} no encontrada`);
    }

    const category = await this.categoryRepository.findOneBy({ id: categoryId });
    if (!category) throw new NotFoundException(`Categoría con ID ${categoryId} no encontrada`);

    const store = this.storeRepository.create({
      ...storeDetails,
      company,
      category,
      owner: user,
    });

    let savedStore;
    try {
      savedStore = await this.storeRepository.save(store);
    } catch (error) {
      this.handleDBExceptions(error);
    }

    // Si el usuario tenía rol USER, lo promovemos a VENDOR
    if (user.role === UserRole.USER) {
      await this.userRepository.update(user.id, { role: UserRole.VENDOR });
    }

    return savedStore;
  }

  async findAll(storePaginationDto: StorePaginationDto) {
    const { 
      limit = 10, 
      offset = 0, 
      sort = 'createdAt', 
      order = 'DESC',
      categoryId,
      city,
      state,
      q
    } = storePaginationDto;

    const queryOptions: any = {
      where: {},
      relations: ['company', 'category', 'owner'],
      take: limit,
      skip: offset,
      order: {
        [sort]: order
      }
    };

    if (categoryId) queryOptions.where.category = { id: categoryId };
    if (city) queryOptions.where.city = city;
    if (state) queryOptions.where.state = state;
    if (q) queryOptions.where.name = Like(`%${q}%`);

    const [data, total] = await this.storeRepository.findAndCount(queryOptions);

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
      relations: ['company', 'category', 'owner']
    });

    if (!store) {
      throw new NotFoundException(`Tienda con ID ${id} no encontrada`);
    }

    return store;
  }

  async update(id: string, updateStoreDto: UpdateStoreDto, user: User) {
    const { companyId, categoryId, ...updateDetails } = updateStoreDto;
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

    if (categoryId) {
      const category = await this.categoryRepository.findOneBy({ id: categoryId });
      if (!category) throw new NotFoundException(`Categoría con ID ${categoryId} no encontrada`);
      store.category = category;
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
