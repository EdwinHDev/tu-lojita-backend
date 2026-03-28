import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { Category } from './entities/category.entity';
import { CategoryQueryDto } from './dto/category-query.dto';

@Injectable()
export class CategoryService {

  constructor(
    @InjectRepository(Category)
    private readonly categoryRepository: Repository<Category>
  ) { }

  async create(createCategoryDto: CreateCategoryDto) {
    const category = this.categoryRepository.create(createCategoryDto);
    return await this.categoryRepository.save(category);
  }

  async findAll(queryDto: CategoryQueryDto) {
    const { inUse } = queryDto;

    const queryBuilder = this.categoryRepository.createQueryBuilder('category');

    if (inUse) {
      // Filtrar solo las categorías que tienen al menos una tienda asociada
      queryBuilder.innerJoin('category.stores', 'store');
      queryBuilder.distinct(true);
    }

    return await queryBuilder.getMany();
  }

  async findOne(id: string) {
    const category = await this.categoryRepository.findOne({
      where: { id }
    });

    if (!category) {
      throw new NotFoundException(`Categoría con ID ${id} no encontrada`);
    }

    return category;
  }

  async update(id: string, updateCategoryDto: UpdateCategoryDto) {
    const category = await this.findOne(id);
    this.categoryRepository.merge(category, updateCategoryDto);
    return await this.categoryRepository.save(category);
  }

  async remove(id: string) {
    const category = await this.findOne(id);
    await this.categoryRepository.remove(category);
    return { deleted: true };
  }
}
