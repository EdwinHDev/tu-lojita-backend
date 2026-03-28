import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateSubcategoryDto } from './dto/create-subcategory.dto';
import { UpdateSubcategoryDto } from './dto/update-subcategory.dto';
import { SubcategoryQueryDto } from './dto/subcategory-query.dto';
import { Subcategory } from './entities/subcategory.entity';
import { Category } from 'src/category/entities/category.entity';

@Injectable()
export class SubcategoryService {

  constructor(
    @InjectRepository(Subcategory)
    private readonly subcategoryRepository: Repository<Subcategory>,
    @InjectRepository(Category)
    private readonly categoryRepository: Repository<Category>,
  ) { }

  async create(createSubcategoryDto: CreateSubcategoryDto) {
    const { categoryId, ...subcategoryData } = createSubcategoryDto;

    const category = await this.categoryRepository.findOne({ where: { id: categoryId } });
    if (!category) {
      throw new NotFoundException(`Categoría con ID ${categoryId} no encontrada`);
    }

    const subcategory = this.subcategoryRepository.create({
      ...subcategoryData,
      category
    });

    return await this.subcategoryRepository.save(subcategory);
  }

  async findAll(queryDto: SubcategoryQueryDto) {
    const { categoryId, inUse, isActive, q } = queryDto;

    const queryBuilder = this.subcategoryRepository.createQueryBuilder('subCategory')
      .leftJoinAndSelect('subCategory.category', 'category');

    if (categoryId) {
      queryBuilder.andWhere('category.id = :categoryId', { categoryId });
    }

    if (inUse) {
      // Filtrar subcategorías que tengan al menos una tienda
      queryBuilder.innerJoin('subCategory.stores', 'store');
      queryBuilder.distinct(true);
    }

    if (isActive !== undefined) {
      queryBuilder.andWhere('subCategory.isActive = :isActive', { isActive });
    }

    if (q) {
      queryBuilder.andWhere('subCategory.name ILIKE :q', { q: `%${q}%` });
    }

    return await queryBuilder.getMany();
  }

  async findOne(id: string) {
    const subcategory = await this.subcategoryRepository.findOne({
      where: { id },
      relations: ['category']
    });

    if (!subcategory) {
      throw new NotFoundException(`Subcategoría con ID ${id} no encontrada`);
    }

    return subcategory;
  }

  async update(id: string, updateSubcategoryDto: UpdateSubcategoryDto) {
    const { categoryId, ...updateData } = updateSubcategoryDto;
    const subcategory = await this.findOne(id);

    if (categoryId) {
      const category = await this.categoryRepository.findOne({ where: { id: categoryId } });
      if (!category) {
        throw new NotFoundException(`Categoría con ID ${categoryId} no encontrada`);
      }
      subcategory.category = category;
    }

    this.subcategoryRepository.merge(subcategory, updateData);
    return await this.subcategoryRepository.save(subcategory);
  }

  async remove(id: string) {
    const subcategory = await this.findOne(id);
    await this.subcategoryRepository.remove(subcategory);
    return { deleted: true };
  }
}
