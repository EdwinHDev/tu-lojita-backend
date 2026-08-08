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
interface AttributeProperty {
  key: string;
  type: string;
  value: any;
  templateId?: string;
}

interface CustomizationOptionInput {
  name: string;
  price?: number;
  minQuantity?: number;
  maxQuantity?: number;
  defaultQuantity?: number;
}

interface CustomizationGroupInput {
  name: string;
  minSelect?: number;
  maxSelect?: number;
  allowOptionQuantity?: boolean | string;
  allow_option_quantity?: boolean | string;
  options?: CustomizationOptionInput[];
}
import { PropertyType } from './types/property-type.enum';
import { CustomizationGroup } from './entities/customization-group.entity';
import { CustomizationOption } from './entities/customization-option.entity';
import { ItemAttributeValue } from './entities/item-attribute-value.entity';

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
    @InjectRepository(CustomizationGroup)
    private readonly customizationGroupRepository: Repository<CustomizationGroup>,
    @InjectRepository(CustomizationOption)
    private readonly customizationOptionRepository: Repository<CustomizationOption>,
    @InjectRepository(ItemAttributeValue)
    private readonly attributeValueRepository: Repository<ItemAttributeValue>,
  ) {}

  private async mapItemResponse(item: Item): Promise<any> {
    if (!item) return item;

    let groups = item.customizationGroupsRel;
    if (!groups) {
      groups = await this.customizationGroupRepository.find({
        where: { item: { id: item.id } },
        relations: ['options'],
      });
    }

    let attrValues = item.attributesRel;
    if (!attrValues) {
      attrValues = await this.attributeValueRepository.find({
        where: { item: { id: item.id } },
      });
    }

    let attributesJson = item.attributes;
    if (attrValues && attrValues.length > 0) {
      attributesJson = {
        properties: attrValues.map((v) => ({
          key: v.key,
          type: v.type,
          value: v.value,
        })),
      } as any;
    }

    let customizationGroupsJson = item.customizationGroups;
    if (groups && groups.length > 0) {
      customizationGroupsJson = groups.map((g) => ({
        id: g.id,
        name: g.name,
        minSelect: g.minSelect,
        maxSelect: g.maxSelect,
        options: (g.options || []).map((opt) => ({
          id: opt.id,
          name: opt.name,
          price: parseFloat(opt.price?.toString() || '0'),
          minQuantity: opt.minQuantity ?? 0,
          maxQuantity: opt.maxQuantity ?? 1,
          defaultQuantity: opt.defaultQuantity ?? 0,
        })),
      }));
    }

    return {
      ...item,
      attributes: attributesJson,
      customizationGroups: customizationGroupsJson,
    };
  }

  private async saveCustomizationAndAttributes(
    item: Item,
    customizationGroups?: CustomizationGroupInput[],
    attributes?: ItemAttributes,
  ) {
    if (
      attributes &&
      attributes.properties &&
      Array.isArray(attributes.properties)
    ) {
      const oldAttrs = await this.attributeValueRepository.find({
        where: { item: { id: item.id } },
      });
      if (oldAttrs.length > 0) {
        await this.attributeValueRepository.remove(oldAttrs);
      }

      for (const prop of attributes.properties) {
        if (prop.key && prop.value !== undefined) {
          const attr = this.attributeValueRepository.create({
            item,
            key: prop.key,
            type: prop.type,
            value: prop.value,
          });
          await this.attributeValueRepository.save(attr);
        }
      }
    }

    if (customizationGroups && Array.isArray(customizationGroups)) {
      const oldGroups = await this.customizationGroupRepository.find({
        where: { item: { id: item.id } },
      });
      if (oldGroups.length > 0) {
        await this.customizationGroupRepository.remove(oldGroups);
      }

      for (const g of customizationGroups) {
        if (!g || !g.name) continue;
        const group = this.customizationGroupRepository.create({
          item,
          name: g.name,
          minSelect: g.minSelect || 0,
          maxSelect: g.maxSelect || 0,
        });
        const savedGroup = await this.customizationGroupRepository.save(group);

        if (g.options && Array.isArray(g.options)) {
          for (const opt of g.options) {
            if (!opt || !opt.name) continue;
            const option = this.customizationOptionRepository.create({
              group: savedGroup,
              name: opt.name,
              price: opt.price || 0,
              minQuantity: opt.minQuantity !== undefined ? Number(opt.minQuantity) : 0,
              maxQuantity: opt.maxQuantity !== undefined ? Number(opt.maxQuantity) : 1,
              defaultQuantity: opt.defaultQuantity !== undefined ? Number(opt.defaultQuantity) : 0,
            });
            await this.customizationOptionRepository.save(option);
          }
        }
      }
    }
  }

  async validateAttributes(
    categoryId: string,
    attributes?: ItemAttributes,
  ) {
    if (
      !attributes ||
      !attributes.properties ||
      !Array.isArray(attributes.properties)
    ) {
      return;
    }

    const templates = await this.templateRepository.find({
      where: { category: { id: categoryId } },
    });

    for (const template of templates) {
      const prop = attributes.properties.find(
        (p) => p.templateId === template.id || p.key === template.name,
      );

      if (
        template.isRequired &&
        (!prop || prop.value === undefined || prop.value === null)
      ) {
        throw new BadRequestException(
          `La propiedad "${template.name}" es obligatoria`,
        );
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
          throw new BadRequestException(
            `La propiedad "${template.name}" debe ser un número`,
          );
        }
        break;
      case PropertyType.LIST:
      case PropertyType.COLOR_LIST:
        if (!Array.isArray(value)) {
          throw new BadRequestException(
            `La propiedad "${template.name}" debe ser una lista`,
          );
        }
        break;
      case PropertyType.BOOLEAN:
        if (typeof value !== 'boolean') {
          throw new BadRequestException(
            `La propiedad "${template.name}" debe ser un booleano`,
          );
        }
        break;
      case PropertyType.COLOR:
      case PropertyType.TEXT:
      case PropertyType.DROPDOWN:
        if (typeof value !== 'string') {
          throw new BadRequestException(
            `La propiedad "${template.name}" debe ser un texto`,
          );
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

    const {
      price: _price,
      discountPrice: _discountPrice,
      priceType,
    } = itemData;
    let { price, discountPrice } = itemData;

    // Lógica profesional para tipos de precio especiales
    if (priceType === PriceType.FREE || priceType === PriceType.ON_DEMAND) {
      price = 0;
      discountPrice = undefined; // Usamos undefined para que TypeORM no lo guarde o lo limpie según la entidad
    }

    // Validar que si trackInventory es true, el stock inicial sea > 0
    const trackInventory = itemData.trackInventory ?? true;
    if (trackInventory) {
      if (
        itemData.stockQuantity === undefined ||
        itemData.stockQuantity === null ||
        Number(itemData.stockQuantity) <= 0
      ) {
        throw new BadRequestException(
          'Debes especificar una cantidad de stock mayor a 0 al activar el control de inventario.',
        );
      }
    }

    const item = this.itemRepository.create({
      ...itemData,
      price,
      discountPrice,
      store,
      category,
    });

    const savedItem = await this.itemRepository.save(item);
    await this.saveCustomizationAndAttributes(
      savedItem,
      createItemDto.customizationGroups,
      createItemDto.attributes,
    );

    return await this.mapItemResponse(savedItem);
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
      .leftJoinAndSelect(
        'item.customizationGroupsRel',
        'customizationGroupsRel',
      )
      .leftJoinAndSelect('customizationGroupsRel.options', 'options')
      .leftJoinAndSelect('item.attributesRel', 'attributesRel')
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

    // Filtro de Publicación e Inventario
    const { isActive, includeInactive } = paginationDto;
    if (includeInactive === true) {
      if (isActive !== undefined) {
        queryBuilder.andWhere('item.isActive = :isActive', { isActive });
      }
    } else {
      // Para cliente público: solo publicados y en stock
      if (isActive !== undefined) {
        queryBuilder.andWhere('item.isActive = :isActive', { isActive });
      } else {
        queryBuilder.andWhere('item.isActive = true');
      }

      queryBuilder.andWhere(
        '(item.trackInventory = false OR (item.trackInventory = true AND item.stockQuantity > 0))',
      );
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

    const mappedData: any[] = [];
    for (const item of data) {
      mappedData.push(await this.mapItemResponse(item));
    }

    return {
      data: mappedData,
      total,
      limit,
      offset,
    };
  }

  async findByStore(storeId: string, paginationDto: ItemPaginationDto) {
    const includeInactive =
      paginationDto.includeInactive !== undefined
        ? paginationDto.includeInactive
        : true;

    return await this.findAll({
      ...paginationDto,
      storeId,
      includeInactive,
    });
  }

  async findOne(id: string) {
    const item = await this.itemRepository.findOne({
      where: { id },
      relations: [
        'store',
        'store.owner',
        'category',
        'customizationGroupsRel',
        'customizationGroupsRel.options',
        'attributesRel',
      ],
    });

    if (!item) {
      throw new NotFoundException(`Item con ID ${id} no encontrado`);
    }
    return await this.mapItemResponse(item);
  }

  async update(id: string, updateItemDto: UpdateItemDto, user: User) {
    const item = await this.itemRepository.findOne({
      where: { id },
      relations: ['store', 'store.owner', 'category'],
    });

    if (!item) {
      throw new NotFoundException(`Item con ID ${id} no encontrado`);
    }

    if (item.store.owner?.id !== user.id) {
      throw new ForbiddenException(
        'No tienes permiso para actualizar este producto',
      );
    }

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
      await this.validateAttributes(
        updateItemDto.categoryId,
        updateItemDto.attributes || item.attributes,
      );
    } else if (updateItemDto.attributes && item.category) {
      await this.validateAttributes(item.category.id, updateItemDto.attributes);
    }

    const effectiveTrackInventory =
      updateItemDto.trackInventory !== undefined
        ? updateItemDto.trackInventory
        : item.trackInventory;
    const effectiveStockQuantity =
      updateItemDto.stockQuantity !== undefined
        ? updateItemDto.stockQuantity
        : item.stockQuantity;

    if (effectiveTrackInventory) {
      if (
        effectiveStockQuantity === undefined ||
        effectiveStockQuantity === null ||
        Number(effectiveStockQuantity) < 0
      ) {
        throw new BadRequestException(
          'La cantidad en stock no puede ser negativa al controlar inventario.',
        );
      }
    }

    this.itemRepository.merge(item, updateItemDto);
    const savedItem = await this.itemRepository.save(item);

    await this.saveCustomizationAndAttributes(
      savedItem,
      updateItemDto.customizationGroups,
      updateItemDto.attributes,
    );

    return await this.mapItemResponse(savedItem);
  }

  async remove(id: string, user: User) {
    const item = await this.itemRepository.findOne({
      where: { id },
      relations: ['store', 'store.owner'],
    });

    if (!item) {
      throw new NotFoundException(`Item con ID ${id} no encontrado`);
    }

    if (item.store.owner?.id !== user.id) {
      throw new ForbiddenException(
        'No tienes permiso para eliminar este producto',
      );
    }

    await this.itemRepository.remove(item);
    return { deleted: true };
  }
}
