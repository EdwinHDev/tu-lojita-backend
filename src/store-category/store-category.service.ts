import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
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
    private readonly dataSource: DataSource,
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
    const template = await this.templateRepository.findOneBy({
      id: templateId,
    });
    if (!template) throw new NotFoundException('Template not found');
    await this.templateRepository.remove(template);
    return { deleted: true };
  }

  async create(createStoreCategoryDto: CreateStoreCategoryDto) {
    const { storeId, propertyTemplates, ...categoryData } =
      createStoreCategoryDto;

    const store = await this.storeRepository.findOneBy({ id: storeId });
    if (!store) {
      throw new NotFoundException(`Tienda con ID ${storeId} no encontrada`);
    }

    return await this.dataSource.transaction(async (manager) => {
      const category = manager.create(StoreCategory, {
        ...categoryData,
        store,
      });

      const savedCategory = await manager.save(category);

      if (propertyTemplates && propertyTemplates.length > 0) {
        const templates = manager.create(
          ItemPropertyTemplate,
          propertyTemplates.map((t) => ({
            ...t,
            category: savedCategory,
          })),
        );
        savedCategory.propertyTemplates = await manager.save(templates);
      } else {
        savedCategory.propertyTemplates = [];
      }

      return savedCategory;
    });
  }

  async findAll() {
    return await this.storeCategoryRepository.find({
      relations: ['store'],
    });
  }

  async findByStore(storeId: string) {
    return await this.storeCategoryRepository.find({
      where: { store: { id: storeId } },
      relations: ['items', 'propertyTemplates'],
    });
  }

  async findByStorePaginated(
    storeId: string,
    limit: number = 50,
    offset: number = 0,
    q?: string,
  ) {
    const queryBuilder = this.storeCategoryRepository
      .createQueryBuilder('category')
      .leftJoinAndSelect('category.items', 'items')
      .leftJoinAndSelect('category.propertyTemplates', 'propertyTemplates')
      .leftJoin('category.store', 'store')
      .where('store.id = :storeId', { storeId });

    if (q) {
      queryBuilder.andWhere('LOWER(category.name) LIKE LOWER(:q)', {
        q: `%${q}%`,
      });
    }

    queryBuilder.take(limit).skip(offset).orderBy('category.name', 'ASC');

    const [data, total] = await queryBuilder.getManyAndCount();
    return { data, total };
  }

  async findOne(id: string) {
    const category = await this.storeCategoryRepository.findOne({
      where: { id },
      relations: ['store', 'items', 'propertyTemplates'],
    });

    if (!category) {
      throw new NotFoundException(`Categoría con ID ${id} no encontrada`);
    }

    return category;
  }

  async update(id: string, updateStoreCategoryDto: UpdateStoreCategoryDto) {
    const { propertyTemplates, ...categoryData } = updateStoreCategoryDto;
    const category = await this.findOne(id);

    return await this.dataSource.transaction(async (manager) => {
      // 1. Update basic category data
      manager.merge(StoreCategory, category, categoryData);
      const savedCategory = await manager.save(category);

      // 2. Synchronize templates if provided
      if (propertyTemplates) {
        const existingTemplates = await manager.find(ItemPropertyTemplate, {
          where: { category: { id } },
        });

        // Identify templates to delete
        const templatesToDelete = existingTemplates.filter(
          (et) => !propertyTemplates.some((pt) => pt.id === et.id),
        );
        if (templatesToDelete.length > 0) {
          await manager.remove(templatesToDelete);
        }

        // Identify templates to add or update
        const templatesToSave = propertyTemplates.map((pt) => {
          const existing = existingTemplates.find((et) => et.id === pt.id);
          if (existing) {
            return manager.merge(ItemPropertyTemplate, existing, pt);
          } else {
            return manager.create(ItemPropertyTemplate, {
              ...pt,
              category: savedCategory,
            });
          }
        });

        if (templatesToSave.length > 0) {
          savedCategory.propertyTemplates = await manager.save(templatesToSave);
        } else {
          savedCategory.propertyTemplates = [];
        }
      }

      return savedCategory;
    });
  }

  async remove(id: string) {
    const category = await this.findOne(id);
    await this.storeCategoryRepository.remove(category);
    return { deleted: true };
  }
}
