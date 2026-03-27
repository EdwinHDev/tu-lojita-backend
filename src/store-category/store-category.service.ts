import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateStoreCategoryDto } from './dto/create-store-category.dto';
import { UpdateStoreCategoryDto } from './dto/update-store-category.dto';
import { StoreCategory } from './entities/store-category.entity';
import { Store } from 'src/store/entities/store.entity';

@Injectable()
export class StoreCategoryService {
  constructor(
    @InjectRepository(StoreCategory)
    private readonly storeCategoryRepository: Repository<StoreCategory>,
    @InjectRepository(Store)
    private readonly storeRepository: Repository<Store>,
  ) {}

  async create(createStoreCategoryDto: CreateStoreCategoryDto) {
    const { storeId, ...categoryData } = createStoreCategoryDto;

    const store = await this.storeRepository.findOneBy({ id: storeId });
    if (!store) {
      throw new NotFoundException(`Tienda con ID ${storeId} no encontrada`);
    }

    const category = this.storeCategoryRepository.create({
      ...categoryData,
      store,
    });

    return await this.storeCategoryRepository.save(category);
  }

  async findAll() {
    return await this.storeCategoryRepository.find({
      relations: ['store']
    });
  }

  async findByStore(storeId: string) {
    return await this.storeCategoryRepository.find({
      where: { store: { id: storeId } },
      relations: ['items']
    });
  }

  async findOne(id: string) {
    const category = await this.storeCategoryRepository.findOne({
      where: { id },
      relations: ['store', 'items']
    });

    if (!category) {
      throw new NotFoundException(`Categoría con ID ${id} no encontrada`);
    }

    return category;
  }

  async update(id: string, updateStoreCategoryDto: UpdateStoreCategoryDto) {
    const category = await this.findOne(id);
    this.storeCategoryRepository.merge(category, updateStoreCategoryDto);
    return await this.storeCategoryRepository.save(category);
  }

  async remove(id: string) {
    const category = await this.findOne(id);
    await this.storeCategoryRepository.remove(category);
    return { deleted: true };
  }
}
