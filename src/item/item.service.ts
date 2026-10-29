import {
  BadRequestException,
  ForbiddenException,
  HttpStatus,
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
import { User, isUserAdult } from 'src/user/entities/user.entity';
import { Store } from 'src/store/entities/store.entity';
import { StoreStatus } from 'src/store/types/status.enum';
import { StoreCategory } from 'src/store-category/entities/store-category.entity';
import { StorePaymentMethod } from 'src/store-payment-method/entities/store-payment-method.entity';
import { ItemPropertyTemplate } from './entities/item-property-template.entity';
import { ItemAttributes } from './types/item-attributes.interface';
import { CompanyActivityLogService } from 'src/company/services/company-activity-log.service';
import { ActivityLogModule } from 'src/company/entities/company-activity-log.entity';
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
import { VariantAxis } from './entities/variant-axis.entity';
import { ItemVariant } from './entities/item-variant.entity';
import { OrderItem } from 'src/order-item/entities/order-item.entity';
import { OrderStatus } from 'src/order/types/order-status.enum';
import { VariantAxisDto } from './dto/variant-axis.dto';
import { ItemVariantDto } from './dto/item-variant.dto';
import { ItemType } from './types/item-type.enum';
import { BookingType } from './types/booking-type.enum';
import { BookingService } from './booking.service';

@Injectable()
export class ItemService {
  constructor(
    @InjectRepository(Item)
    private readonly itemRepository: Repository<Item>,
    @InjectRepository(Store)
    private readonly storeRepository: Repository<Store>,
    @InjectRepository(StoreCategory)
    private readonly storeCategoryRepository: Repository<StoreCategory>,
    @InjectRepository(StorePaymentMethod)
    private readonly storePaymentMethodRepository: Repository<StorePaymentMethod>,
    @InjectRepository(ItemPropertyTemplate)
    private readonly templateRepository: Repository<ItemPropertyTemplate>,
    @InjectRepository(CustomizationGroup)
    private readonly customizationGroupRepository: Repository<CustomizationGroup>,
    @InjectRepository(CustomizationOption)
    private readonly customizationOptionRepository: Repository<CustomizationOption>,
    @InjectRepository(ItemAttributeValue)
    private readonly attributeValueRepository: Repository<ItemAttributeValue>,
    @InjectRepository(VariantAxis)
    private readonly variantAxisRepository: Repository<VariantAxis>,
    @InjectRepository(ItemVariant)
    private readonly itemVariantRepository: Repository<ItemVariant>,
    @InjectRepository(OrderItem)
    private readonly orderItemRepository: Repository<OrderItem>,
    private readonly bookingService: BookingService,
    private readonly activityLogService: CompanyActivityLogService,
  ) {}

  private async enrichStoresWithBranchStatus(
    stores: Store[],
  ): Promise<Store[]> {
    if (!stores || stores.length === 0) return stores;

    const companyIds = Array.from(
      new Set(
        stores
          .map((s) => s.company?.id)
          .filter((id): id is string => Boolean(id)),
      ),
    );

    if (companyIds.length === 0) {
      for (const store of stores) {
        store.hasMultipleBranches = false;
      }
      return stores;
    }

    const companyCounts = await this.storeRepository
      .createQueryBuilder('s')
      .select('s.companyId', 'companyId')
      .addSelect('COUNT(s.id)', 'count')
      .where('s.companyId IN (:...companyIds)', { companyIds })
      .groupBy('s.companyId')
      .getRawMany<{ companyId: string; count: string }>();

    const countMap = new Map(
      companyCounts.map((c) => [c.companyId, parseInt(c.count, 10)]),
    );

    for (const store of stores) {
      const count = store.company?.id
        ? (countMap.get(store.company.id) ?? 1)
        : 1;
      store.hasMultipleBranches = count > 1;
    }

    return stores;
  }

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

    let variantAxesJson: any[] = [];
    let variantsJson: any[] = [];

    if (item.hasVariants) {
      let axes = item.variantAxes;
      if (!axes) {
        axes = await this.variantAxisRepository.find({
          where: { item: { id: item.id } },
          order: { position: 'ASC' },
        });
      }
      variantAxesJson = (axes || []).map((a) => ({
        id: a.id,
        name: a.name,
        values: a.values,
        position: a.position,
      }));

      let variants = item.variants;
      if (!variants) {
        variants = await this.itemVariantRepository.find({
          where: { item: { id: item.id } },
        });
      }
      variantsJson = (variants || []).map((v) => ({
        id: v.id,
        sku: v.sku,
        price:
          v.price !== null && v.price !== undefined
            ? parseFloat(v.price.toString())
            : null,
        discountPrice:
          v.discountPrice !== null && v.discountPrice !== undefined
            ? parseFloat(v.discountPrice.toString())
            : null,
        stockQuantity: parseFloat(v.stockQuantity?.toString() || '0'),
        isActive: v.isActive,
        axisValues: v.axisValues,
        imageUrl: v.imageUrl || null,
      }));
    }

    const totalStock = item.hasVariants
      ? variantsJson
          .filter((v) => v.isActive)
          .reduce((sum, v) => sum + v.stockQuantity, 0)
      : item.stockQuantity !== null && item.stockQuantity !== undefined
        ? parseFloat(item.stockQuantity.toString())
        : null;

    return {
      ...item,
      store: item.store
        ? {
            ...item.store,
            hasMultipleBranches: item.store.hasMultipleBranches ?? false,
          }
        : item.store,
      stockQuantity: totalStock,
      favoritesCount: Number(item.favoritesCount || 0),
      attributes: attributesJson,
      customizationGroups: customizationGroupsJson,
      variantAxes: variantAxesJson,
      variants: variantsJson,
      bookingType: item.bookingType || BookingType.NONE,
      slotConfig: item.slotConfig
        ? {
            ...item.slotConfig,
            minNoticeHours: Number(item.slotConfig.minNoticeHours || 0),
            slots: (item.slotConfig.slots || []).map((s) => ({
              id: s.id,
              dayOfWeek: s.dayOfWeek,
              specificDate: s.specificDate,
              startTime: s.startTime,
              endTime: s.endTime,
              label: s.label,
              isActive: s.isActive,
            })),
          }
        : undefined,
      preorderConfig: item.preorderConfig
        ? {
            ...item.preorderConfig,
            depositValue: Number(item.preorderConfig.depositValue || 0),
          }
        : undefined,
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
              minQuantity:
                opt.minQuantity !== undefined ? Number(opt.minQuantity) : 0,
              maxQuantity:
                opt.maxQuantity !== undefined ? Number(opt.maxQuantity) : 1,
              defaultQuantity:
                opt.defaultQuantity !== undefined
                  ? Number(opt.defaultQuantity)
                  : 0,
            });
            await this.customizationOptionRepository.save(option);
          }
        }
      }
    }
  }

  private generateCartesianCombinations(
    axes: { name: string; values: string[] }[],
  ): Record<string, string>[] {
    if (!axes || axes.length === 0) return [];
    return axes.reduce<Record<string, string>[]>(
      (acc, axis) => {
        const result: Record<string, string>[] = [];
        for (const combo of acc) {
          for (const val of axis.values) {
            result.push({ ...combo, [axis.name]: val });
          }
        }
        return result;
      },
      [{}],
    );
  }

  private generateSku(
    storeName: string,
    itemTitle: string,
    axisValues: Record<string, string>,
  ): string {
    const clean = (s: string) =>
      (s || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    const storeShort = (clean(storeName) || 'STR').slice(0, 3);
    const itemShort = (clean(itemTitle) || 'ITM').slice(0, 3);
    const valParts = Object.values(axisValues).map((v) =>
      (clean(v) || 'VAL').slice(0, 3),
    );
    return [storeShort, itemShort, ...valParts].join('-');
  }

  private areAxisValuesEqual(
    a: Record<string, string>,
    b: Record<string, string>,
  ): boolean {
    const keysA = Object.keys(a || {});
    const keysB = Object.keys(b || {});
    if (keysA.length !== keysB.length) return false;
    return keysA.every((k) => {
      const valA = a[k];
      const valB = b[k];
      if (valA === valB) return true;
      if (valA && valB && (valA.includes('|') || valB.includes('|'))) {
        const partsA = valA.split('|');
        const partsB = valB.split('|');
        return (
          partsA[0]?.trim() === partsB[0]?.trim() &&
          partsA[1]?.trim() === partsB[1]?.trim()
        );
      }
      return false;
    });
  }

  private async saveVariantsAndAxes(
    item: Item,
    storeName: string,
    hasVariants?: boolean,
    variantAxesDto?: VariantAxisDto[],
    variantsDto?: ItemVariantDto[],
  ) {
    if (hasVariants === false) {
      if (item.hasVariants) {
        // Validar órdenes pendientes con variantes
        const pendingVariantOrdersCount = await this.orderItemRepository
          .createQueryBuilder('oi')
          .innerJoin('oi.order', 'o')
          .where('oi.item.id = :itemId', { itemId: item.id })
          .andWhere('oi.variantId IS NOT NULL')
          .andWhere('o.status IN (:...statuses)', {
            statuses: [OrderStatus.PENDING, OrderStatus.PARTIALLY_PAID],
          })
          .getCount();

        if (pendingVariantOrdersCount > 0) {
          throw new BadRequestException(
            'No puedes desactivar las variantes mientras existan órdenes pendientes con variantes de este artículo.',
          );
        }

        // Sumar stock de variantes activas al stock global
        const activeVariants = await this.itemVariantRepository.find({
          where: { item: { id: item.id }, isActive: true },
        });
        const totalStock = activeVariants.reduce(
          (sum, v) => sum + parseFloat(v.stockQuantity?.toString() || '0'),
          0,
        );
        item.stockQuantity = totalStock;
        item.hasVariants = false;
        await this.itemRepository.save(item);

        for (const v of activeVariants) {
          v.isActive = false;
          await this.itemVariantRepository.save(v);
        }
      }
      return;
    }

    if (!hasVariants && !item.hasVariants) {
      return;
    }

    // Activar variantes si no estaban activas
    if (!item.hasVariants && hasVariants) {
      item.stockQuantity = 0;
      item.hasVariants = true;
      await this.itemRepository.save(item);
    } else {
      item.hasVariants = true;
    }

    if (variantAxesDto && Array.isArray(variantAxesDto)) {
      if (variantAxesDto.length > 3) {
        throw new BadRequestException(
          'Máximo 3 ejes de variación permitidos por artículo.',
        );
      }

      for (const axis of variantAxesDto) {
        if (!axis.name || !axis.name.trim()) {
          throw new BadRequestException(
            'Cada eje debe tener un nombre válido.',
          );
        }
        if (!axis.values || axis.values.length === 0) {
          throw new BadRequestException(
            `El eje "${axis.name}" debe contener al menos un valor.`,
          );
        }
      }

      const combinations = this.generateCartesianCombinations(
        variantAxesDto.map((a) => ({
          name: a.name.trim(),
          values: a.values.map((v) => v.trim()).filter(Boolean),
        })),
      );

      if (combinations.length > 100) {
        throw new BadRequestException(
          `La configuración genera ${combinations.length} variantes. El límite máximo es 100 variantes por artículo.`,
        );
      }

      // Recrear ejes guardados
      await this.variantAxisRepository.delete({ item: { id: item.id } });
      let pos = 0;
      for (const axisDto of variantAxesDto) {
        const axis = this.variantAxisRepository.create({
          item,
          name: axisDto.name.trim(),
          values: axisDto.values.map((v) => v.trim()).filter(Boolean),
          position: axisDto.position !== undefined ? axisDto.position : pos++,
        });
        await this.variantAxisRepository.save(axis);
      }

      // Sincronizar variantes preservando datos configurados previamente
      const existingVariants = await this.itemVariantRepository.find({
        where: { item: { id: item.id } },
      });

      const matchedVariantIds = new Set<string>();

      for (const combo of combinations) {
        const dto = variantsDto?.find((v) =>
          this.areAxisValuesEqual(v.axisValues, combo),
        );
        const existing = existingVariants.find((v) =>
          this.areAxisValuesEqual(v.axisValues, combo),
        );

        const sku =
          dto?.sku ||
          existing?.sku ||
          this.generateSku(storeName, item.title, combo);
        const price =
          dto?.price !== undefined
            ? dto.price
            : existing?.price !== undefined
              ? existing.price
              : null;
        const discountPrice =
          dto?.discountPrice !== undefined
            ? dto.discountPrice
            : existing?.discountPrice !== undefined
              ? existing.discountPrice
              : null;
        const stockQuantity =
          dto?.stockQuantity !== undefined
            ? dto.stockQuantity
            : existing?.stockQuantity !== undefined
              ? parseFloat(existing.stockQuantity.toString())
              : 0;
        const isActive =
          dto?.isActive !== undefined
            ? dto.isActive
            : existing?.isActive !== undefined
              ? existing.isActive
              : true;

        let imageUrl =
          dto?.imageUrl !== undefined ? dto.imageUrl : existing?.imageUrl;
        if (!imageUrl) {
          for (const val of Object.values(combo)) {
            if (typeof val === 'string' && val.includes('|')) {
              const parts = val.split('|');
              if (parts.length > 2 && parts[2]?.trim()) {
                imageUrl = parts[2].trim();
                break;
              }
            }
          }
        }

        if (existing) {
          matchedVariantIds.add(existing.id);
          existing.sku = sku;
          existing.price = price !== null ? price : undefined;
          existing.discountPrice =
            discountPrice !== null ? discountPrice : undefined;
          existing.stockQuantity = stockQuantity;
          existing.isActive = isActive;
          existing.axisValues = combo;
          existing.imageUrl = imageUrl || undefined;
          await this.itemVariantRepository.save(existing);
        } else {
          const newVariant = this.itemVariantRepository.create({
            item,
            sku,
            price: price !== null ? price : undefined,
            discountPrice: discountPrice !== null ? discountPrice : undefined,
            stockQuantity,
            isActive,
            axisValues: combo,
            imageUrl: imageUrl || undefined,
          });
          const saved = await this.itemVariantRepository.save(newVariant);
          matchedVariantIds.add(saved.id);
        }
      }

      // Variantes obsoletas (ya no están en la combinatoria)
      for (const oldVariant of existingVariants) {
        if (!matchedVariantIds.has(oldVariant.id)) {
          const hasOrders = await this.orderItemRepository.count({
            where: { variant: { id: oldVariant.id } },
          });
          if (hasOrders > 0) {
            oldVariant.isActive = false;
            await this.itemVariantRepository.save(oldVariant);
          } else {
            await this.itemVariantRepository.remove(oldVariant);
          }
        }
      }
    }

    // Cálculo automático de minPrice y priceType (Task 2.8)
    const currentActiveVariants = await this.itemVariantRepository.find({
      where: { item: { id: item.id }, isActive: true },
    });

    if (currentActiveVariants.length > 0) {
      const prices = currentActiveVariants.map((v) => {
        const effDiscount =
          v.discountPrice !== null && v.discountPrice !== undefined
            ? parseFloat(v.discountPrice.toString())
            : null;
        const effPrice =
          v.price !== null && v.price !== undefined
            ? parseFloat(v.price.toString())
            : parseFloat((item.price ?? 0).toString());
        return effDiscount !== null && effDiscount < effPrice
          ? effDiscount
          : effPrice;
      });

      const minPrice = Math.min(...prices);
      const maxPrice = Math.max(...prices);

      item.price = minPrice;
      item.priceType =
        minPrice < maxPrice ? PriceType.STARTING_AT : PriceType.FIXED;
      await this.itemRepository.save(item);
    }
  }

  async validateAttributes(categoryId: string, attributes?: ItemAttributes) {
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
      relations: ['owner', 'company'],
    });

    if (!store) {
      throw new NotFoundException(`Tienda con ID ${storeId} no encontrada`);
    }

    const isCollab =
      (user as any)?.isCollaborator === true ||
      (user as any)?.actorType === 'COLLABORATOR';
    if (isCollab) {
      const collab = user as any;
      if (store.company?.id !== collab.company?.id) {
        throw new ForbiddenException(
          'No tienes permiso para agregar productos a esta empresa',
        );
      }
      if (
        !collab.hasFullBranchAccess &&
        !(collab.allowedBranchIds || []).includes(store.id)
      ) {
        throw new ForbiddenException(
          'No tienes autorización para agregar productos en esta sucursal',
        );
      }
      if (!(collab.permissions || []).includes('inventory:edit')) {
        throw new ForbiddenException(
          'No tienes el permiso [inventory:edit] para crear artículos',
        );
      }
    } else if (store.owner?.id !== user.id) {
      throw new ForbiddenException(
        'No tienes permiso para agregar productos a esta tienda',
      );
    }

    // 1. Validar que la tienda tenga al menos una categoría registrada
    const categoryCount = await this.storeCategoryRepository.count({
      where: { store: { id: storeId } },
    });
    if (categoryCount === 0) {
      throw new BadRequestException(
        'No puedes publicar artículos porque la tienda aún no tiene categorías registradas. Crea al menos una categoría primero.',
      );
    }

    // 2. Validar que la tienda tenga al menos un método de pago activo
    const activePaymentMethodsCount =
      await this.storePaymentMethodRepository.count({
        where: { store: { id: storeId }, isActive: true },
      });
    if (activePaymentMethodsCount === 0) {
      throw new BadRequestException(
        'No puedes publicar artículos porque la tienda no tiene ningún método de pago activo configurado. Configura al menos un método de pago activo primero.',
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

    // Validar que si trackInventory es true, el stock inicial sea > 0 (si no tiene variantes ni es preorder ni servicio)
    const isServiceOrSlot =
      itemData.itemType === ItemType.SERVICE ||
      itemData.bookingType === BookingType.TIME_SLOT;
    const trackInventory = isServiceOrSlot
      ? false
      : (itemData.trackInventory ?? true);
    if (
      trackInventory &&
      !createItemDto.hasVariants &&
      itemData.bookingType !== BookingType.PRE_ORDER
    ) {
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
    await this.saveVariantsAndAxes(
      savedItem,
      store.name,
      createItemDto.hasVariants,
      createItemDto.variantAxes,
      createItemDto.variants,
    );

    if (
      createItemDto.slotConfig &&
      createItemDto.bookingType === BookingType.TIME_SLOT
    ) {
      await this.bookingService.configureSlotBooking(
        savedItem.id,
        createItemDto.slotConfig,
        user,
      );
    } else if (
      createItemDto.preorderConfig &&
      createItemDto.bookingType === BookingType.PRE_ORDER
    ) {
      await this.bookingService.configurePreorder(
        savedItem.id,
        createItemDto.preorderConfig,
        user,
      );
    }

    const companyId = store.company?.id || (user as any).company?.id;
    if (companyId) {
      this.activityLogService.log({
        companyId,
        storeId: store.id,
        user,
        module: ActivityLogModule.INVENTORY,
        action: 'ITEM_CREATED',
        description: `Creó el artículo "${item.title}" en la sucursal "${store.name}".`,
        metadata: {
          itemId: savedItem.id,
          title: item.title,
          price: item.price,
          itemType: item.itemType,
        },
      });
    }

    return await this.findOne(savedItem.id);
  }

  async findAll(paginationDto: ItemPaginationDto, user?: User) {
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
      .leftJoinAndSelect('store.company', 'company')
      .leftJoinAndSelect('item.category', 'category')
      .leftJoinAndSelect(
        'item.customizationGroupsRel',
        'customizationGroupsRel',
      )
      .leftJoinAndSelect('customizationGroupsRel.options', 'options')
      .leftJoinAndSelect('item.attributesRel', 'attributesRel')
      .leftJoinAndSelect('item.slotConfig', 'slotConfig')
      .leftJoinAndSelect('slotConfig.slots', 'slots')
      .leftJoinAndSelect('item.preorderConfig', 'preorderConfig')
      .leftJoin('store.subcategory', 'subCategory')
      .leftJoin('subCategory.category', 'globalCategory')
      .leftJoin('store.addresses', 'address')
      .limit(limit)
      .offset(offset);

    // Filtro estricto: Solo mostrar items pertenecientes a tiendas ACTIVAS
    queryBuilder.andWhere('store.status = :activeStatus', {
      activeStatus: StoreStatus.ACTIVE,
    });

    // Control estricto de edad (+18): si el usuario es menor o no verificado, excluir items y tiendas +18
    if (!isUserAdult(user)) {
      queryBuilder.andWhere('item.isAgeRestricted = false');
      queryBuilder.andWhere('store.isAgeRestricted = false');
    }

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
        '(item.trackInventory = false OR item.hasVariants = true OR (item.trackInventory = true AND item.stockQuantity > 0))',
      );
    }

    if (onlyInStock) {
      // Filtrar items disponibles (ilimitados O con variantes O limitados con stock > 0)
      queryBuilder.andWhere(
        '(item.trackInventory = false OR item.hasVariants = true OR (item.trackInventory = true AND item.stockQuantity > 0))',
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

    const stores = data
      .map((item) => item.store)
      .filter((s): s is Store => Boolean(s));
    await this.enrichStoresWithBranchStatus(stores);

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

  async findAllForAdmin(query: {
    limit?: number;
    offset?: number;
    search?: string;
    storeId?: string;
    isActive?: boolean | string;
    stockStatus?: 'IN_STOCK' | 'OUT_OF_STOCK' | 'ALL';
  }) {
    const limit = query.limit !== undefined ? Number(query.limit) : 50;
    const offset = query.offset !== undefined ? Number(query.offset) : 0;
    const { search, storeId, isActive, stockStatus } = query;

    const queryBuilder = this.itemRepository
      .createQueryBuilder('item')
      .leftJoinAndSelect('item.store', 'store')
      .leftJoinAndSelect('store.owner', 'owner')
      .leftJoinAndSelect('store.company', 'company')
      .leftJoinAndSelect('item.category', 'category')
      .orderBy('item.createdAt', 'DESC')
      .take(limit)
      .skip(offset);

    if (search && search.trim()) {
      const term = `%${search.trim().toLowerCase()}%`;
      queryBuilder.andWhere(
        '(LOWER(item.title) LIKE :term OR LOWER(store.name) LIKE :term OR LOWER(owner.firstName) LIKE :term OR LOWER(owner.lastName) LIKE :term OR LOWER(owner.email) LIKE :term)',
        { term },
      );
    }

    if (storeId) {
      queryBuilder.andWhere('store.id = :storeId', { storeId });
    }

    if (isActive !== undefined && isActive !== '' && isActive !== 'ALL') {
      const activeBool = isActive === true || isActive === 'true';
      queryBuilder.andWhere('item.isActive = :activeBool', { activeBool });
    }

    if (stockStatus === 'IN_STOCK') {
      queryBuilder.andWhere(
        '(item.trackInventory = false OR item.hasVariants = true OR (item.trackInventory = true AND item.stockQuantity > 0))',
      );
    } else if (stockStatus === 'OUT_OF_STOCK') {
      queryBuilder.andWhere(
        '(item.trackInventory = true AND item.hasVariants = false AND (item.stockQuantity <= 0 OR item.stockQuantity IS NULL))',
      );
    }

    const [items, total] = await queryBuilder.getManyAndCount();

    // Summary metrics across platform
    const totalItems = await this.itemRepository.count();
    const activeItems = await this.itemRepository.count({
      where: { isActive: true },
    });
    const outOfStockItems = await this.itemRepository
      .createQueryBuilder('i')
      .where(
        'i.trackInventory = true AND i.hasVariants = false AND (i.stockQuantity <= 0 OR i.stockQuantity IS NULL)',
      )
      .getCount();

    const rawStoresCount = await this.itemRepository
      .createQueryBuilder('item')
      .innerJoin('item.store', 'store')
      .select('COUNT(DISTINCT store.id)', 'count')
      .getRawOne();
    const uniqueStoresWithItems = rawStoresCount?.count
      ? Number(rawStoresCount.count)
      : 0;

    return {
      items,
      total,
      limit,
      offset,
      metrics: {
        totalItems,
        activeItems,
        outOfStockItems,
        uniqueStoresWithItems,
      },
    };
  }

  async findByStore(
    storeId: string,
    paginationDto: ItemPaginationDto,
    user?: User,
  ) {
    const includeInactive =
      paginationDto.includeInactive !== undefined
        ? paginationDto.includeInactive
        : true;

    return await this.findAll(
      {
        ...paginationDto,
        storeId,
        includeInactive,
      },
      user,
    );
  }

  async findOne(id: string, user?: User) {
    const item = await this.itemRepository.findOne({
      where: { id },
      relations: [
        'store',
        'store.company',
        'store.owner',
        'category',
        'customizationGroupsRel',
        'customizationGroupsRel.options',
        'attributesRel',
        'variantAxes',
        'variants',
        'slotConfig',
        'slotConfig.slots',
        'preorderConfig',
      ],
    });

    if (!item) {
      throw new NotFoundException(`Item con ID ${id} no encontrado`);
    }

    if (item.store) {
      await this.enrichStoresWithBranchStatus([item.store]);
    }

    const isRestricted = item.isAgeRestricted || item.store?.isAgeRestricted;
    if (isRestricted && !isUserAdult(user)) {
      throw new ForbiddenException({
        statusCode: HttpStatus.FORBIDDEN,
        message: 'Este producto está restringido a mayores de 18 años',
        code: 'AGE_RESTRICTED',
      });
    }

    return await this.mapItemResponse(item);
  }

  async update(id: string, updateItemDto: UpdateItemDto, user: User) {
    const item = await this.itemRepository.findOne({
      where: { id },
      relations: [
        'store',
        'store.owner',
        'store.company',
        'category',
        'variantAxes',
        'variants',
      ],
    });

    if (!item) {
      throw new NotFoundException(`Item con ID ${id} no encontrado`);
    }

    const isCollab =
      (user as any)?.isCollaborator === true ||
      (user as any)?.actorType === 'COLLABORATOR';
    if (isCollab) {
      const collab = user as any;
      if (item.store.company?.id !== collab.company?.id) {
        throw new ForbiddenException(
          'No tienes permiso para actualizar este producto',
        );
      }
      if (
        !collab.hasFullBranchAccess &&
        !(collab.allowedBranchIds || []).includes(item.store.id)
      ) {
        throw new ForbiddenException(
          'No tienes autorización para gestionar artículos en esta sucursal',
        );
      }
      const hasEdit = (collab.permissions || []).includes('inventory:edit');
      const hasStock = (collab.permissions || []).includes(
        'inventory:manage_stock',
      );
      const hasPrice =
        (collab.permissions || []).includes('inventory:change_price') ||
        hasEdit;

      if (!hasEdit && !hasStock) {
        throw new ForbiddenException(
          'No tienes permisos para modificar este producto',
        );
      }
      if (
        !hasPrice &&
        (updateItemDto.price !== undefined ||
          updateItemDto.discountPrice !== undefined)
      ) {
        throw new ForbiddenException(
          'No tienes permisos para modificar el precio de este producto',
        );
      }
    } else if (item.store.owner?.id !== user.id) {
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

    const hasVariantsActive =
      updateItemDto.hasVariants !== undefined
        ? updateItemDto.hasVariants
        : item.hasVariants;

    const effectiveTrackInventory =
      updateItemDto.trackInventory !== undefined
        ? updateItemDto.trackInventory
        : item.trackInventory;
    const effectiveStockQuantity =
      updateItemDto.stockQuantity !== undefined
        ? updateItemDto.stockQuantity
        : item.stockQuantity;

    if (effectiveTrackInventory && !hasVariantsActive) {
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

    await this.saveVariantsAndAxes(
      savedItem,
      item.store?.name || '',
      updateItemDto.hasVariants,
      updateItemDto.variantAxes,
      updateItemDto.variants,
    );

    if (
      updateItemDto.slotConfig &&
      (updateItemDto.bookingType === BookingType.TIME_SLOT ||
        item.bookingType === BookingType.TIME_SLOT)
    ) {
      await this.bookingService.configureSlotBooking(
        savedItem.id,
        updateItemDto.slotConfig,
        user,
      );
    } else if (
      updateItemDto.preorderConfig &&
      (updateItemDto.bookingType === BookingType.PRE_ORDER ||
        item.bookingType === BookingType.PRE_ORDER)
    ) {
      await this.bookingService.configurePreorder(
        savedItem.id,
        updateItemDto.preorderConfig,
        user,
      );
    }

    const companyId = item.store.company?.id || (user as any).company?.id;
    if (companyId) {
      if (
        updateItemDto.price !== undefined &&
        Number(updateItemDto.price) !== Number(item.price)
      ) {
        this.activityLogService.log({
          companyId,
          storeId: item.store.id,
          user,
          module: ActivityLogModule.INVENTORY,
          action: 'PRICE_UPDATE',
          description: `Actualizó el precio de "${item.title}" de \$${item.price} a \$${updateItemDto.price}.`,
          metadata: {
            itemId: item.id,
            previousPrice: item.price,
            newPrice: updateItemDto.price,
          },
        });
      }
      if (
        updateItemDto.stockQuantity !== undefined &&
        Number(updateItemDto.stockQuantity) !== Number(item.stockQuantity)
      ) {
        this.activityLogService.log({
          companyId,
          storeId: item.store.id,
          user,
          module: ActivityLogModule.INVENTORY,
          action: 'STOCK_UPDATE',
          description: `Ajustó existencias de "${item.title}" de ${item.stockQuantity} a ${updateItemDto.stockQuantity} unidades.`,
          metadata: {
            itemId: item.id,
            previousStock: item.stockQuantity,
            newStock: updateItemDto.stockQuantity,
          },
        });
      }
      if (updateItemDto.variants !== undefined) {
        this.activityLogService.log({
          companyId,
          storeId: item.store.id,
          user,
          module: ActivityLogModule.INVENTORY,
          action: 'VARIANT_STOCK_UPDATE',
          description: `Ajustó existencias de variantes para "${item.title}".`,
          metadata: {
            itemId: item.id,
          },
        });
      }
    }

    return await this.findOne(savedItem.id);
  }

  async remove(id: string, user: User) {
    const item = await this.itemRepository.findOne({
      where: { id },
      relations: ['store', 'store.owner', 'store.company'],
    });

    if (!item) {
      throw new NotFoundException(`Item con ID ${id} no encontrado`);
    }

    const isCollab =
      (user as any)?.isCollaborator === true ||
      (user as any)?.actorType === 'COLLABORATOR';
    if (isCollab) {
      const collab = user as any;
      if (item.store.company?.id !== collab.company?.id) {
        throw new ForbiddenException(
          'No tienes permiso para eliminar este producto',
        );
      }
      if (
        !collab.hasFullBranchAccess &&
        !(collab.allowedBranchIds || []).includes(item.store.id)
      ) {
        throw new ForbiddenException(
          'No tienes autorización para eliminar artículos en esta sucursal',
        );
      }
      if (!(collab.permissions || []).includes('inventory:edit')) {
        throw new ForbiddenException(
          'No tienes el permiso [inventory:edit] para eliminar artículos',
        );
      }
    } else if (item.store.owner?.id !== user.id) {
      throw new ForbiddenException(
        'No tienes permiso para eliminar este producto',
      );
    }

    const companyId = item.store.company?.id || (user as any).company?.id;
    const itemTitle = item.title;
    const storeName = item.store.name;
    const storeId = item.store.id;

    await this.itemRepository.remove(item);

    if (companyId) {
      this.activityLogService.log({
        companyId,
        storeId,
        user,
        module: ActivityLogModule.INVENTORY,
        action: 'ITEM_DELETED',
        description: `Eliminó el artículo "${itemTitle}" de la sucursal "${storeName}".`,
        metadata: { itemId: id, title: itemTitle },
      });
    }

    return { deleted: true };
  }
}
