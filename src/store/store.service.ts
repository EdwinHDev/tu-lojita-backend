import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateStoreDto } from './dto/create-store.dto';
import { UpdateStoreDto } from './dto/update-store.dto';
import { Store } from './entities/store.entity';
import { Company } from 'src/company/entities/company.entity';
import { Category } from 'src/category/entities/category.entity';
import { User } from 'src/user/entities/user.entity';
import { UserRole } from 'src/user/types/user-role.enum';

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

    const savedStore = await this.storeRepository.save(store);

    // Si el usuario tenía rol USER, lo promovemos a VENDOR
    if (user.role === UserRole.USER) {
      await this.userRepository.update(user.id, { role: UserRole.VENDOR });
    }

    return savedStore;
  }

  findAll() {
    return this.storeRepository.find({
      relations: ['company', 'category', 'owner']
    });
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

  async update(id: string, updateStoreDto: UpdateStoreDto) {
    const { companyId, categoryId, ...updateDetails } = updateStoreDto;
    const store = await this.findOne(id);

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
    return await this.storeRepository.save(store);
  }

  async remove(id: string) {
    const store = await this.findOne(id);
    await this.storeRepository.remove(store);
    return { deleted: true };
  }
}
