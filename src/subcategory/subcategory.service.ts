import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateSubcategoryDto } from './dto/create-subcategory.dto';
import { UpdateSubcategoryDto } from './dto/update-subcategory.dto';
import { SubcategoryQueryDto } from './dto/subcategory-query.dto';
import { Subcategory } from './entities/subcategory.entity';
import { Category } from 'src/category/entities/category.entity';
import { User, isUserAdult } from 'src/user/entities/user.entity';

@Injectable()
export class SubcategoryService {
  constructor(
    @InjectRepository(Subcategory)
    private readonly subcategoryRepository: Repository<Subcategory>,
    @InjectRepository(Category)
    private readonly categoryRepository: Repository<Category>,
  ) {}

  async create(createSubcategoryDto: CreateSubcategoryDto) {
    const { categoryId, ...subcategoryData } = createSubcategoryDto;

    const category = await this.categoryRepository.findOne({
      where: { id: categoryId },
    });
    if (!category) {
      throw new NotFoundException(
        `Categoría con ID ${categoryId} no encontrada`,
      );
    }

    const isAgeRestricted =
      category.isAgeRestricted || Boolean(subcategoryData.isAgeRestricted);

    const subcategory = this.subcategoryRepository.create({
      ...subcategoryData,
      isAgeRestricted,
      category,
    });

    return await this.subcategoryRepository.save(subcategory);
  }

  async findAll(queryDto: SubcategoryQueryDto, user?: User | null) {
    const {
      categoryId,
      inUse,
      isActive,
      q,
      search,
      page = 1,
      limit = 20,
    } = queryDto;

    const searchTerm = search || q;

    const queryBuilder = this.subcategoryRepository
      .createQueryBuilder('subCategory')
      .leftJoinAndSelect('subCategory.category', 'category');

    if (!isUserAdult(user)) {
      queryBuilder.andWhere('subCategory.isAgeRestricted = false');
      queryBuilder.andWhere('category.isAgeRestricted = false');
    }

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

    if (searchTerm) {
      queryBuilder.andWhere('subCategory.name ILIKE :searchTerm', {
        searchTerm: `%${searchTerm}%`,
      });
    }

    queryBuilder.skip((page - 1) * limit);
    queryBuilder.take(limit);

    return await queryBuilder.getMany();
  }

  async findOne(id: string) {
    const subcategory = await this.subcategoryRepository.findOne({
      where: { id },
      relations: ['category'],
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
      const category = await this.categoryRepository.findOne({
        where: { id: categoryId },
      });
      if (!category) {
        throw new NotFoundException(
          `Categoría con ID ${categoryId} no encontrada`,
        );
      }
      subcategory.category = category;
    }

    // Si la categoría padre es +18, la subcategoría hereda obligatoriamente +18
    if (subcategory.category && subcategory.category.isAgeRestricted) {
      updateData.isAgeRestricted = true;
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
