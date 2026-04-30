import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateItemDto } from './dto/create-item.dto';
import { UpdateItemDto } from './dto/update-item.dto';
import { Item } from './entities/item.entity';
import { PriceType } from './types/price-type.enum';
import { ItemPaginationDto } from './dto/item-pagination.dto';
import { User } from 'src/user/entities/user.entity';
import { Store } from 'src/store/entities/store.entity';
import { StoreCategory } from 'src/store-category/entities/store-category.entity';
import { ItemPropertyTemplate } from './entities/item-property-template.entity';
import { ItemAttributes } from './types/item-attributes.interface';
import { PropertyType } from './types/property-type.enum';

@Injectable()
export class ItemService {
  constructor(
    @InjectRepository(Item)
    private readonly itemRepository: Repository<Item>,
    @InjectRepository(Store)
    private readonly storeRepository: Repository<Store>,
    @InjectRepository(StoreCategory)
    private readonly storeCategoryRepository: Repository<StoreCategory>,
    @InjectRepository(ItemPropertyTemplate)
    private readonly templateRepository: Repository<ItemPropertyTemplate>,
  ) {}

  async validateAttributes(categoryId: string, attributes: any) {
    if (!attributes || !attributes.properties || !Array.isArray(attributes.properties)) {
      return;
    }

    const templates = await this.templateRepository.find({
      where: { category: { id: categoryId } },
    });

    for (const template of templates) {
      const prop = attributes.properties.find(
        (p: any) => p.templateId === template.id || p.key === template.name,
      );

      if (template.isRequired && (!prop || prop.value === undefined || prop.value === null)) {
        throw new BadRequestException(`La propiedad "${template.name}" es obligatoria`);
      }

      if (prop) {
        this.checkValueType(template, prop.value);
      }
    }
  }

  private checkValueType(template: ItemPropertyTemplate, value: any) {
    switch (template.type) {
      case PropertyType.NUMBER:
        if (typeof value !== 'number') {
          throw new BadRequestException(`La propiedad "${template.name}" debe ser un número`);
        }
        break;
      case PropertyType.LIST:
      case PropertyType.COLOR_LIST:
        if (!Array.isArray(value)) {
          throw new BadRequestException(`La propiedad "${template.name}" debe ser una lista`);
        }
        break;
      case PropertyType.BOOLEAN:
        if (typeof value !== 'boolean') {
          throw new BadRequestException(`La propiedad "${template.name}" debe ser un booleano`);
        }
        break;
      case PropertyType.COLOR:
      case PropertyType.TEXT:
      case PropertyType.DROPDOWN:
        if (typeof value !== 'string') {
          throw new BadRequestException(`La propiedad "${template.name}" debe ser un texto`);
        }
        break;
    }
  }

  async create(createItemDto: CreateItemDto, user: User) {
    const { storeId, categoryId, ...itemData } = createItemDto;

    const store = await this.storeRepository.findOne({
      where: { id: storeId },
      relations: ['owner'],
    });

    if (!store) {
      throw new NotFoundException(`Tienda con ID ${storeId} no encontrada`);
    }

    if (store.owner?.id !== user.id) {
      throw new ForbiddenException(
        'No tienes permiso para agregar productos a esta tienda',
      );
    }

    let category: StoreCategory | undefined;
    if (categoryId) {
      category =
        (await this.storeCategoryRepository.findOne({
          where: { id: categoryId, store: { id: storeId } },
        })) ?? undefined;

      if (!category) {
        throw new NotFoundException(
          `Categoría con ID ${categoryId} no encontrada en esta tienda`,
        );
      }
      // Validar atributos contra plantillas de la categoría
      await this.validateAttributes(categoryId, itemData.attributes);
    }

    let { price, discountPrice, priceType } = itemData;

    // Lógica profesional para tipos de precio especiales
    if (priceType === PriceType.FREE || priceType === PriceType.ON_DEMAND) {
      price = 0;
      discountPrice = undefined; // Usamos undefined para que TypeORM no lo guarde o lo limpie según la entidad
    }

    const item = this.itemRepository.create({
      ...itemData,
      price,
      discountPrice,
      store,
      category,
    });

    return await this.itemRepository.save(item);
  }

  async findAll(paginationDto: ItemPaginationDto) {
    const {
      limit = 10,
      offset = 0,
      sort = 'createdAt',
      order = 'DESC',
      minPrice,
      maxPrice,
      storeId,
      storeCategoryId,
      globalCategoryId,
      city,
      state,
      q,
      isFeatured,
      hasDiscount,
      onlyInStock,
      priceType,
    } = paginationDto;

    const queryBuilder = this.itemRepository
      .createQueryBuilder('item')
      .leftJoinAndSelect('item.store', 'store')
      .leftJoinAndSelect('item.category', 'category')
      .leftJoin('store.subcategory', 'subCategory')
      .leftJoin('subCategory.category', 'globalCategory')
      .leftJoin('store.addresses', 'address')
      .limit(limit)
      .offset(offset);

    // Filtros de Precio
    if (minPrice !== undefined) {
      queryBuilder.andWhere('item.price >= :minPrice', { minPrice });
    }
    if (maxPrice !== undefined) {
      queryBuilder.andWhere('item.price <= :maxPrice', { maxPrice });
    }

    // Filtro por Tipo de Precio
    if (priceType) {
      queryBuilder.andWhere('item.priceType = :priceType', { priceType });
    } else {
      /**
       * Si no se pide explícitamente ON_DEMAND, lo excluimos de filtros de rango
       * de precio para evitar confusión, ya que su precio 0 es simbólico.
       */
      if (minPrice !== undefined || maxPrice !== undefined) {
        queryBuilder.andWhere('item.priceType != :onDemand', {
          onDemand: PriceType.ON_DEMAND,
        });
      }
    }

    // Filtros de Relación
    if (storeId) {
      queryBuilder.andWhere('store.id = :storeId', { storeId });
    }
    if (storeCategoryId) {
      queryBuilder.andWhere('category.id = :storeCategoryId', {
        storeCategoryId,
      });
    }
    if (globalCategoryId) {
      // Filtramos por la categoría global (Abuela) a través de la subcategoría de la tienda
      queryBuilder.andWhere('globalCategory.id = :globalCategoryId', {
        globalCategoryId,
      });
    }

    // Filtros de Ubicación (vía StoreAddress)
    if (city) {
      queryBuilder.andWhere('address.city ILIKE :city', { city: `%${city}%` });
    }
    if (state) {
      queryBuilder.andWhere('address.state ILIKE :state', {
        state: `%${state}%`,
      });
    }

    // Búsqueda por Texto
    if (q) {
      queryBuilder.andWhere('LOWER(item.title) LIKE LOWER(:q)', {
        q: `%${q}%`,
      });
    }

    // Filtros de Marketplace
    if (isFeatured !== undefined) {
      queryBuilder.andWhere('item.isFeatured = :isFeatured', { isFeatured });
    }

    if (hasDiscount) {
      // Filtrar items que tienen precio de descuento activo
      queryBuilder.andWhere('item.discountPrice IS NOT NULL');
    }

    if (onlyInStock) {
      // Filtrar items disponibles (ilimitados O limitados con stock > 0)
      queryBuilder.andWhere(
        '(item.trackInventory = false OR (item.trackInventory = true AND item.stockQuantity > 0))',
      );
    }

    // Ordenamiento (Normal o Aleatorio para Postgres)
    if (sort === 'random') {
      // Para RANDOM() en Postgres con DISTINCT/Pagination, añadimos el select
      queryBuilder.addSelect('RANDOM()', 'temp_random');
      queryBuilder.orderBy('temp_random', 'ASC');
    } else {
      queryBuilder.orderBy(`item.${sort}`, order);
    }

    const [data, total] = await queryBuilder.getManyAndCount();

    return {
      data,
      total,
      limit,
      offset,
    };
  }

  async findByStore(storeId: string, paginationDto: ItemPaginationDto) {
    // Usar findAll con el filtro de storeId para aprovechar toda la lógica de paginación y búsqueda
    return await this.findAll({
      ...paginationDto,
      storeId,
    });
  }

  async findOne(id: string) {
    const item = await this.itemRepository.findOne({
      where: { id },
      relations: ['store', 'store.owner', 'category'],
    });

    if (!item) {
      throw new NotFoundException(`Item con ID ${id} no encontrado`);
    }
    return item;
  }

  async update(id: string, updateItemDto: UpdateItemDto, user: User) {
    const item = await this.findOne(id);

    if (item.store.owner?.id !== user.id) {
      throw new ForbiddenException(
        'No tienes permiso para actualizar este producto',
      );
    }

    // Aplicar lógica de tipos de precio en la actualización
    if (
      updateItemDto.priceType === PriceType.FREE ||
      updateItemDto.priceType === PriceType.ON_DEMAND
    ) {
      updateItemDto.price = 0;
      updateItemDto.discountPrice = undefined;
    }

    if (updateItemDto.categoryId) {
      const category = await this.storeCategoryRepository.findOne({
        where: { id: updateItemDto.categoryId, store: { id: item.store.id } },
      });

      if (!category) {
        throw new NotFoundException(
          `Categoría con ID ${updateItemDto.categoryId} no encontrada en esta tienda`,
        );
      }
      item.category = category;
      // Validar atributos contra plantillas de la nueva categoría
      await this.validateAttributes(updateItemDto.categoryId, updateItemDto.attributes || item.attributes);
    } else if (updateItemDto.attributes && item.category) {
      // Validar atributos contra plantillas de la categoría actual
      await this.validateAttributes(item.category.id, updateItemDto.attributes);
    }

    this.itemRepository.merge(item, updateItemDto);
    return await this.itemRepository.save(item);
  }

  async remove(id: string, user: User) {
    const item = await this.findOne(id);

    if (item.store.owner?.id !== user.id) {
      throw new ForbiddenException(
        'No tienes permiso para eliminar este producto',
      );
    }

    await this.itemRepository.remove(item);
    return { deleted: true };
  }
}
