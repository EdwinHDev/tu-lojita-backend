import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateStoreCategoryDto } from './dto/create-store-category.dto';
import { UpdateStoreCategoryDto } from './dto/update-store-category.dto';
import { StoreCategory } from './entities/store-category.entity';
import { Store } from 'src/store/entities/store.entity';
import { ItemPropertyTemplate } from 'src/item/entities/item-property-template.entity';

@Injectable()
export class StoreCategoryService {
  constructor(
    @InjectRepository(StoreCategory)
    private readonly storeCategoryRepository: Repository<StoreCategory>,
    @InjectRepository(Store)
    private readonly storeRepository: Repository<Store>,
    @InjectRepository(ItemPropertyTemplate)
    private readonly templateRepository: Repository<ItemPropertyTemplate>,
  ) {}

  async findTemplates(categoryId: string) {
    return await this.templateRepository.find({
      where: { category: { id: categoryId } },
    });
  }

  async addTemplate(categoryId: string, templateData: any) {
    const category = await this.findOne(categoryId);
    const template = this.templateRepository.create({
      ...templateData,
      category,
    });
    return await this.templateRepository.save(template);
  }

  async removeTemplate(templateId: string) {
    const template = await this.templateRepository.findOneBy({ id: templateId });
    if (!template) throw new NotFoundException('Template not found');
    await this.templateRepository.remove(template);
    return { deleted: true };
  }

  async create(createStoreCategoryDto: CreateStoreCategoryDto) {
    const { storeId, propertyTemplates, ...categoryData } = createStoreCategoryDto;

    const store = await this.storeRepository.findOneBy({ id: storeId });
    if (!store) {
      throw new NotFoundException(`Tienda con ID ${storeId} no encontrada`);
    }

    const category = this.storeCategoryRepository.create({
      ...categoryData,
      store,
    });

    const savedCategory = await this.storeCategoryRepository.save(category);

    if (propertyTemplates && propertyTemplates.length > 0) {
      const templates = this.templateRepository.create(
        propertyTemplates.map((t) => ({
          ...t,
          category: savedCategory,
        })),
      );
      await this.templateRepository.save(templates);
    }

    return savedCategory;
  }

  async findAll() {
    return await this.storeCategoryRepository.find({
      relations: ['store'],
    });
  }

  async findByStore(storeId: string) {
    return await this.storeCategoryRepository.find({
      where: { store: { id: storeId } },
      relations: ['items'],
    });
  }

  async findOne(id: string) {
    const category = await this.storeCategoryRepository.findOne({
      where: { id },
      relations: ['store', 'items'],
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
