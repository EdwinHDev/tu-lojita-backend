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
import { UserRole } from 'src/user/types/user-role.enum';
import { CustomizationGroup } from './entities/customization-group.entity';
import { CustomizationOption } from './entities/customization-option.entity';
import { ItemAttributeValue } from './entities/item-attribute-value.entity';
import { VariantAxis } from './entities/variant-axis.entity';
import { ItemVariant } from './entities/item-variant.entity';
import { OrderItem } from 'src/order-item/entities/order-item.entity';
import { OrderStatus } from 'src/order/types/order-status.enum';
import { OrderDispute } from 'src/order-dispute/entities/order-dispute.entity';
import { DisputeStatus } from 'src/order-dispute/types';
import { VariantAxisDto } from './dto/variant-axis.dto';
import { ItemVariantDto } from './dto/item-variant.dto';
import { ItemType } from './types/item-type.enum';
import { BookingType } from './types/booking-type.enum';
import { BookingService } from './booking.service';
import { ItemPromotion } from './entities/item-promotion.entity';
import { ItemPromotionStatus } from './types/item-promotion-status.enum';
import { PlatformSettingsService } from 'src/platform-settings/platform-settings.service';
import { RequestPromotionDto } from './dto/request-promotion.dto';
import { CommissionService } from 'src/commission/commission.service';

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
    @InjectRepository(OrderDispute)
    private readonly orderDisputeRepository: Repository<OrderDispute>,
    @InjectRepository(ItemPromotion)
    private readonly itemPromotionRepository: Repository<ItemPromotion>,
    private readonly platformSettingsService: PlatformSettingsService,
    private readonly bookingService: BookingService,
    private readonly activityLogService: CompanyActivityLogService,
    private readonly commissionService: CommissionService,
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

      let storeForMap: Store | null | undefined = item.store;
      if (!storeForMap) {
        if ((item as any).storeId) {
          storeForMap = await this.storeRepository.findOne({ where: { id: (item as any).storeId } });
        } else if (item.id) {
          const itemWithStore = await this.itemRepository.findOne({
            where: { id: item.id },
            relations: ['store'],
          });
          storeForMap = itemWithStore?.store;
        }
      }

      variantsJson = await Promise.all((variants || []).map(async (v) => {
        let vPrice = v.price !== null && v.price !== undefined ? parseFloat(v.price.toString()) : null;
        let vBase = v.basePrice !== null && v.basePrice !== undefined ? parseFloat(v.basePrice.toString()) : null;
        let vRate = v.commissionRate !== null && v.commissionRate !== undefined ? parseFloat(v.commissionRate.toString()) : 0;
        let vAmount = v.commissionAmount !== null && v.commissionAmount !== undefined ? parseFloat(v.commissionAmount.toString()) : 0;

        if (vBase !== null && vBase > 0 && (vAmount === 0 || vPrice === vBase) && storeForMap) {
          const comm = await this.commissionService.calculateCommission(vBase, false, storeForMap);
          vRate = comm.rate;
          vAmount = comm.commissionAmount;
          vPrice = Math.round((vBase + vAmount) * 100) / 100;
        }

        return {
          id: v.id,
          sku: v.sku,
          basePrice: vBase,
          commissionRate: vRate,
          commissionAmount: vAmount,
          price: vPrice,
          discountPrice:
            v.discountPrice !== null && v.discountPrice !== undefined
              ? parseFloat(v.discountPrice.toString())
              : null,
          stockQuantity: parseFloat(v.stockQuantity?.toString() || '0'),
          isActive: v.isActive,
          axisValues: v.axisValues,
          imageUrl: v.imageUrl || null,
        };
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
    return keysA.every((kA) => {
      const normKeyA = kA.trim().toLowerCase();
      const kB = keysB.find((k) => k.trim().toLowerCase() === normKeyA);
      if (!kB) return false;
      const valA = a[kA];
      const valB = b[kB];
      if (valA === valB) return true;
      if (typeof valA !== 'string' || typeof valB !== 'string') return false;
      const baseA = valA.split('|')[0]?.trim().toLowerCase() ?? '';
      const baseB = valB.split('|')[0]?.trim().toLowerCase() ?? '';
      return baseA.length > 0 && baseA === baseB;
    });
  }

  private async saveVariantsAndAxes(
    item: Item,
    storeName: string,
    hasVariants?: boolean,
    variantAxesDto?: VariantAxisDto[],
    variantsDto?: ItemVariantDto[],
  ) {
    // Evitar que TypeORM cascade-inserte copias duplicadas al guardar `item`
    delete (item as any).variantAxes;
    delete (item as any).variants;

    if (hasVariants === false) {
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

      const existingVariants = await this.itemVariantRepository.find({
        where: { item: { id: item.id } },
      });
      const activeVariants = existingVariants.filter((v) => v.isActive);

      if (item.hasVariants && activeVariants.length > 0) {
        const totalStock = activeVariants.reduce(
          (sum, v) => sum + parseFloat(v.stockQuantity?.toString() || '0'),
          0,
        );
        if (!item.stockQuantity || Number(item.stockQuantity) <= 0) {
          item.stockQuantity = totalStock;
        }
      }

      item.hasVariants = false;
      await this.itemRepository.save(item);

      // Eliminar todos los ejes del artículo
      await this.variantAxisRepository.delete({ item: { id: item.id } });

      // Eliminar variantes sin historial de órdenes; desactivar las que tengan órdenes históricas
      for (const v of existingVariants) {
        const hasOrders = await this.orderItemRepository.count({
          where: { variant: { id: v.id } },
        });
        if (hasOrders > 0) {
          if (v.isActive) {
            v.isActive = false;
            await this.itemVariantRepository.save(v);
          }
        } else {
          await this.itemVariantRepository.remove(v);
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

      let storeForVariant: Store | null | undefined = item.store;
      if (!storeForVariant) {
        if (item.id) {
          const itemWithStore = await this.itemRepository.findOne({
            where: { id: item.id },
            relations: ['store'],
          });
          storeForVariant = itemWithStore?.store;
        }
        if (!storeForVariant && (item as any).storeId) {
          storeForVariant = await this.storeRepository.findOne({
            where: { id: (item as any).storeId },
          });
        }
      }

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

        let vBase: number | null = null;
        if (dto?.basePrice !== undefined && dto.basePrice !== null) {
          vBase = parseFloat(dto.basePrice.toString());
        } else if (dto?.price !== undefined && dto.price !== null) {
          vBase = parseFloat(dto.price.toString());
        } else if (existing?.basePrice !== undefined && existing.basePrice !== null) {
          vBase = parseFloat(existing.basePrice.toString());
        } else if (existing?.price !== undefined && existing.price !== null) {
          vBase = parseFloat(existing.price.toString());
        } else if (item.basePrice !== undefined && item.basePrice !== null) {
          vBase = parseFloat(item.basePrice.toString());
        } else if (item.price !== undefined && item.price !== null) {
          vBase = parseFloat(item.price.toString());
        }

        let vRate = 0;
        let vAmount = 0;
        let vPrice: number | null = null;

        if (vBase !== null && vBase > 0) {
          if (storeForVariant) {
            const comm = await this.commissionService.calculateCommission(vBase, false, storeForVariant);
            vRate = comm.rate;
            vAmount = comm.commissionAmount;
            vPrice = Math.round((vBase + vAmount) * 100) / 100;
          } else {
            vPrice = vBase;
          }
        } else if (vBase !== null) {
          vPrice = 0;
        }

        let vDiscount =
          dto?.discountPrice !== undefined
            ? dto.discountPrice
            : existing?.discountPrice !== undefined
              ? existing.discountPrice
              : null;

        if (dto?.discountPrice !== undefined && dto.discountPrice !== null && dto.discountPrice > 0) {
          const discBase = parseFloat(dto.discountPrice.toString());
          const storeForVariant = item.store || (await this.storeRepository.findOne({ where: { items: { id: item.id } } }));
          if (storeForVariant) {
            const discComm = await this.commissionService.calculateCommission(discBase, false, storeForVariant);
            vDiscount = Math.round((discBase + discComm.commissionAmount) * 100) / 100;
          }
        }

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
          existing.basePrice = vBase !== null ? vBase : undefined;
          existing.commissionRate = vRate;
          existing.commissionAmount = vAmount;
          existing.price = vPrice !== null ? vPrice : undefined;
          existing.discountPrice =
            vDiscount !== null ? vDiscount : undefined;
          existing.stockQuantity = stockQuantity;
          existing.isActive = isActive;
          existing.axisValues = combo;
          existing.imageUrl = imageUrl || undefined;
          await this.itemVariantRepository.save(existing);
        } else {
          const newVariant = this.itemVariantRepository.create({
            item,
            sku,
            basePrice: vBase !== null ? vBase : undefined,
            commissionRate: vRate,
            commissionAmount: vAmount,
            price: vPrice !== null ? vPrice : undefined,
            discountPrice: vDiscount !== null ? vDiscount : undefined,
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

      const basePrices = currentActiveVariants.map((v) => {
        return v.basePrice !== null && v.basePrice !== undefined
          ? parseFloat(v.basePrice.toString())
          : parseFloat((item.basePrice ?? item.price ?? 0).toString());
      });

      const minPrice = Math.min(...prices);
      const maxPrice = Math.max(...prices);
      const minBasePrice = Math.min(...basePrices);

      item.price = minPrice;
      if (minBasePrice > 0) {
        item.basePrice = minBasePrice;
      }
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

    // Determinar precio base (ganancia neta de la tienda)
    let basePrice = 0;
    if (itemData.basePrice !== undefined && itemData.basePrice !== null) {
      basePrice = parseFloat(itemData.basePrice.toString());
    } else if (price !== undefined && price !== null) {
      basePrice = parseFloat(price.toString());
    }

    let commissionRate = 0;
    let commissionAmount = 0;

    // Lógica profesional para tipos de precio especiales
    if (priceType === PriceType.FREE || priceType === PriceType.ON_DEMAND) {
      basePrice = 0;
      commissionRate = 0;
      commissionAmount = 0;
      price = 0;
      discountPrice = undefined; // Usamos undefined para que TypeORM no lo guarde o lo limpie según la entidad
    } else if (basePrice > 0) {
      const commCalc = await this.commissionService.calculateCommission(
        basePrice,
        false,
        store,
      );
      commissionRate = commCalc.rate;
      commissionAmount = commCalc.commissionAmount;
      price = Math.round((basePrice + commissionAmount) * 100) / 100;
    } else {
      price = 0;
    }

    if (discountPrice !== undefined && discountPrice !== null && discountPrice > 0) {
      const discBase = parseFloat(discountPrice.toString());
      const discComm = await this.commissionService.calculateCommission(
        discBase,
        false,
        store,
      );
      discountPrice = Math.round((discBase + discComm.commissionAmount) * 100) / 100;
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

    const {
      variantAxes: _createVariantAxes,
      variants: _createVariants,
      ...scalarItemData
    } = itemData;

    const item = this.itemRepository.create({
      ...scalarItemData,
      basePrice,
      commissionRate,
      commissionAmount,
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

  async findAll(paginationDto: ItemPaginationDto, user?: User | null) {
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
      itemType,
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

    // Filtro estricto: Solo mostrar items no eliminados pertenecientes a tiendas ACTIVAS
    queryBuilder.andWhere('item.isDeleted = false');
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

    // Filtro por Tipo de Artículo (PRODUCT / SERVICE)
    if (itemType) {
      queryBuilder.andWhere('item.itemType = :itemType', { itemType });
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
      .where('item.isDeleted = false')
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
    const totalItems = await this.itemRepository.count({
      where: { isDeleted: false },
    });
    const activeItems = await this.itemRepository.count({
      where: { isActive: true, isDeleted: false },
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
    user?: User | null,
  ) {
    let includeInactive = false;

    if (paginationDto.includeInactive === true && user) {
      if (user.role === UserRole.ADMIN) {
        includeInactive = true;
      } else {
        const isCollab =
          (user as any)?.isCollaborator === true ||
          (user as any)?.actorType === 'COLLABORATOR';

        if (isCollab) {
          const collab = user as any;
          const hasBranchAccess =
            collab.hasFullBranchAccess ||
            (collab.allowedBranchIds || []).includes(storeId);
          if (hasBranchAccess) {
            includeInactive = true;
          }
        } else {
          const store = await this.storeRepository.findOne({
            where: { id: storeId },
            relations: ['owner'],
          });
          if (store && store.owner?.id === user.id) {
            includeInactive = true;
          }
        }
      }
    }

    return await this.findAll(
      {
        ...paginationDto,
        storeId,
        includeInactive,
      },
      user,
    );
  }

  async findOne(id: string, user?: User | null) {
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

    if (!item || item.isDeleted) {
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

    if (!item || item.isDeleted) {
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

    if (updateItemDto.isActive === false && item.isActive === true) {
      // 1. Verificación operativa: Órdenes en curso
      const activeOrdersCount = await this.orderItemRepository
        .createQueryBuilder('oi')
        .innerJoin('oi.order', 'o')
        .where('oi.itemId = :itemId', { itemId: id })
        .andWhere('o.status IN (:...statuses)', {
          statuses: [OrderStatus.PENDING, OrderStatus.PARTIALLY_PAID],
        })
        .getCount();

      if (activeOrdersCount > 0) {
        throw new BadRequestException(
          'No se puede despublicar el artículo porque tiene compras o pedidos en curso.',
        );
      }

      // 2. Verificación operativa: Disputas abiertas
      const activeDisputesCount = await this.orderDisputeRepository
        .createQueryBuilder('d')
        .innerJoin('d.order', 'o')
        .innerJoin('o.orderItems', 'oi')
        .where('oi.itemId = :itemId', { itemId: id })
        .andWhere('d.status IN (:...disputeStatuses)', {
          disputeStatuses: [
            DisputeStatus.OPEN,
            DisputeStatus.MERCHANT_RESPONDED,
            DisputeStatus.ADMIN_REVIEW,
          ],
        })
        .getCount();

      if (activeDisputesCount > 0) {
        throw new BadRequestException(
          'No se puede despublicar el artículo porque tiene una disputa o mediación abierta en revisión.',
        );
      }
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

    const effectiveBase =
      updateItemDto.basePrice !== undefined
        ? parseFloat(updateItemDto.basePrice.toString())
        : updateItemDto.price !== undefined
          ? parseFloat(updateItemDto.price.toString())
          : item.basePrice;

    if (
      updateItemDto.priceType === PriceType.FREE ||
      updateItemDto.priceType === PriceType.ON_DEMAND
    ) {
      updateItemDto.basePrice = 0;
      updateItemDto.price = 0;
      updateItemDto.discountPrice = undefined;
      item.commissionRate = 0;
      item.commissionAmount = 0;
    } else if (effectiveBase !== undefined && effectiveBase !== null && effectiveBase > 0) {
      const commCalc = await this.commissionService.calculateCommission(
        effectiveBase,
        false,
        item.store,
      );
      updateItemDto.basePrice = effectiveBase;
      item.commissionRate = commCalc.rate;
      item.commissionAmount = commCalc.commissionAmount;
      updateItemDto.price = Math.round((effectiveBase + commCalc.commissionAmount) * 100) / 100;
    }

    if (updateItemDto.discountPrice !== undefined) {
      if (updateItemDto.discountPrice !== null && updateItemDto.discountPrice > 0) {
        const discBase = parseFloat(updateItemDto.discountPrice.toString());
        const discComm = await this.commissionService.calculateCommission(
          discBase,
          false,
          item.store,
        );
        updateItemDto.discountPrice = Math.round((discBase + discComm.commissionAmount) * 100) / 100;
      } else {
        updateItemDto.discountPrice = undefined;
      }
    }

    const {
      variantAxes: _updateVariantAxes,
      variants: _updateVariants,
      ...scalarUpdateDto
    } = updateItemDto;
    delete (item as any).variantAxes;
    delete (item as any).variants;
    this.itemRepository.merge(item, scalarUpdateDto);
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

    if (!item || item.isDeleted) {
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

    // 1. Verificación operativa: Órdenes en curso
    const activeOrdersCount = await this.orderItemRepository
      .createQueryBuilder('oi')
      .innerJoin('oi.order', 'o')
      .where('oi.itemId = :itemId', { itemId: id })
      .andWhere('o.status IN (:...statuses)', {
        statuses: [OrderStatus.PENDING, OrderStatus.PARTIALLY_PAID],
      })
      .getCount();

    if (activeOrdersCount > 0) {
      throw new BadRequestException(
        'No se puede eliminar el artículo porque tiene compras o pedidos en curso.',
      );
    }

    // 2. Verificación operativa: Disputas abiertas
    const activeDisputesCount = await this.orderDisputeRepository
      .createQueryBuilder('d')
      .innerJoin('d.order', 'o')
      .innerJoin('o.orderItems', 'oi')
      .where('oi.itemId = :itemId', { itemId: id })
      .andWhere('d.status IN (:...disputeStatuses)', {
        disputeStatuses: [
          DisputeStatus.OPEN,
          DisputeStatus.MERCHANT_RESPONDED,
          DisputeStatus.ADMIN_REVIEW,
        ],
      })
      .getCount();

    if (activeDisputesCount > 0) {
      throw new BadRequestException(
        'No se puede eliminar el artículo porque tiene una disputa o mediación abierta en revisión.',
      );
    }

    // 3. Borrado lógico (Soft Delete): Preserva la fila en BD para integridad relacional con historial
    item.isDeleted = true;
    item.deletedAt = new Date();
    item.isActive = false;
    await this.itemRepository.save(item);

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

  /**
   * Obtiene la vitrina de artículos destacados para el Home de la app de clientes.
   * Prioriza los artículos con promoción activa aprobada y rellena los cupos
   * vacíos con los más vendidos (fallback) hasta alcanzar maxItems.
   */
  async getFeaturedShowcase(): Promise<{
    enabled: boolean;
    title: string;
    carouselSeconds: number;
    items: any[];
  }> {
    const config = await this.platformSettingsService.getFeaturedShowcaseConfig();
    if (!config.enabled) {
      return {
        enabled: false,
        title: config.title,
        carouselSeconds: config.carouselSeconds,
        items: [],
      };
    }

    const now = new Date();

    // 1. Obtener artículos con promoción activa aprobada
    const activePromotions = await this.itemPromotionRepository
      .createQueryBuilder('promo')
      .innerJoinAndSelect('promo.item', 'item')
      .leftJoinAndSelect('item.store', 'store')
      .leftJoinAndSelect('store.company', 'company')
      .leftJoinAndSelect('item.category', 'category')
      .where('promo.status = :status', { status: ItemPromotionStatus.APPROVED })
      .andWhere('promo.startsAt <= :now', { now })
      .andWhere('promo.expiresAt > :now', { now })
      .andWhere('item.isActive = :isActive', { isActive: true })
      .andWhere('item.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere('store.status = :storeStatus', { storeStatus: StoreStatus.ACTIVE })
      .andWhere('store.isDeleted = :storeDeleted', { storeDeleted: false })
      .andWhere(
        '(item.trackInventory = false OR item.hasVariants = true OR (item.trackInventory = true AND item.stockQuantity > 0))',
      )
      .orderBy('promo.startsAt', 'DESC')
      .take(config.maxItems)
      .getMany();

    const featuredItemsMap = new Map<string, any>();
    for (const promo of activePromotions) {
      if (promo.item && !featuredItemsMap.has(promo.item.id)) {
        const mapped = await this.mapItemResponse(promo.item);
        featuredItemsMap.set(promo.item.id, {
          ...mapped,
          isFeaturedAd: true,
          badgeLabel: 'DESTACADO',
          expiresAt: promo.expiresAt,
        });
      }
    }

    const featuredItems = Array.from(featuredItemsMap.values());
    let finalItems = [...featuredItems];

    // 2. Si hay cupos disponibles y fallback está activo, completar con más vendidos
    if (finalItems.length < config.maxItems && config.fillWithBestSellers) {
      const needed = config.maxItems - finalItems.length;
      const excludeIds = finalItems.map((i) => i.id);

      const bestSellersQuery = this.orderItemRepository
        .createQueryBuilder('oi')
        .innerJoin('oi.order', 'order')
        .innerJoin('oi.item', 'item')
        .select('item.id', 'itemId')
        .addSelect('SUM(oi.quantity)', 'totalSold')
        .where('order.status IN (:...completedStatuses)', {
          completedStatuses: [
            OrderStatus.FULLY_PAID,
            OrderStatus.PARTIALLY_PAID,
          ],
        })
        .andWhere('item.isActive = :isActive', { isActive: true })
        .andWhere('item.isDeleted = :isDeleted', { isDeleted: false });

      if (excludeIds.length > 0) {
        bestSellersQuery.andWhere('item.id NOT IN (:...excludeIds)', { excludeIds });
      }

      const bestSellersRaw = await bestSellersQuery
        .groupBy('item.id')
        .orderBy('"totalSold"', 'DESC')
        .limit(needed)
        .getRawMany();

      if (bestSellersRaw.length > 0) {
        const itemIds = bestSellersRaw.map((r) => r.itemId);
        const bestSellerItems = await this.itemRepository
          .createQueryBuilder('item')
          .leftJoinAndSelect('item.store', 'store')
          .leftJoinAndSelect('store.company', 'company')
          .leftJoinAndSelect('item.category', 'category')
          .where('item.id IN (:...itemIds)', { itemIds })
          .andWhere('item.isActive = :isActive', { isActive: true })
          .andWhere('item.isDeleted = :isDeleted', { isDeleted: false })
          .andWhere('store.status = :storeStatus', { storeStatus: StoreStatus.ACTIVE })
          .andWhere('store.isDeleted = :storeDeleted', { storeDeleted: false })
          .andWhere(
            '(item.trackInventory = false OR item.hasVariants = true OR (item.trackInventory = true AND item.stockQuantity > 0))',
          )
          .getMany();

        for (const it of bestSellerItems) {
          const rawItem = bestSellersRaw.find((r) => r.itemId === it.id);
          const mapped = await this.mapItemResponse(it);
          finalItems.push({
            ...mapped,
            isFeaturedAd: false,
            isFallback: true,
            badgeLabel: 'TOP VENTAS',
            totalSold: rawItem ? parseInt(rawItem.totalSold, 10) : 0,
          });
        }
      }

      // Si aún faltan items para completar el cupo (ej. plataforma nueva sin órdenes suficientes),
      // complementar con los productos activos más recientes en stock
      if (finalItems.length < config.maxItems) {
        const remainingNeeded = config.maxItems - finalItems.length;
        const currentExcludeIds = finalItems.map((i) => i.id);

        const fallbackRecentQuery = this.itemRepository
          .createQueryBuilder('item')
          .leftJoinAndSelect('item.store', 'store')
          .leftJoinAndSelect('store.company', 'company')
          .leftJoinAndSelect('item.category', 'category')
          .where('item.isActive = :isActive', { isActive: true })
          .andWhere('item.isDeleted = :isDeleted', { isDeleted: false })
          .andWhere('store.status = :storeStatus', { storeStatus: StoreStatus.ACTIVE })
          .andWhere('store.isDeleted = :storeDeleted', { storeDeleted: false })
          .andWhere(
            '(item.trackInventory = false OR item.hasVariants = true OR (item.trackInventory = true AND item.stockQuantity > 0))',
          );

        if (currentExcludeIds.length > 0) {
          fallbackRecentQuery.andWhere('item.id NOT IN (:...currentExcludeIds)', { currentExcludeIds });
        }

        const recentFallbacks = await fallbackRecentQuery
          .orderBy('item.createdAt', 'DESC')
          .limit(remainingNeeded)
          .getMany();

        for (const it of recentFallbacks) {
          const mapped = await this.mapItemResponse(it);
          finalItems.push({
            ...mapped,
            isFeaturedAd: false,
            isFallback: true,
            badgeLabel: 'DESTACADO',
          });
        }
      }
    }

    // Enriquecer tiendas
    const stores = finalItems
      .map((i) => i.store)
      .filter((s): s is Store => Boolean(s));
    await this.enrichStoresWithBranchStatus(stores);

    return {
      enabled: true,
      title: config.title,
      carouselSeconds: config.carouselSeconds,
      items: finalItems.slice(0, config.maxItems),
    };
  }

  /**
   * Registra una solicitud de promoción para un artículo por parte del comerciante.
   */
  async requestPromotion(
    itemId: string,
    user: User,
    dto: RequestPromotionDto,
  ): Promise<ItemPromotion> {
    const item = await this.itemRepository.findOne({
      where: { id: itemId, isDeleted: false },
      relations: ['store', 'store.company', 'store.company.owner'],
    });

    if (!item) {
      throw new NotFoundException('Artículo no encontrado.');
    }

    if (user.role !== UserRole.ADMIN) {
      const isOwner = item.store?.company?.owner?.id === user.id;
      const isCollaborator = user.company?.id && item.store?.company?.id === user.company.id;
      if (!isOwner && !isCollaborator) {
        throw new ForbiddenException('No tienes permisos sobre este artículo.');
      }
    }

    const promotion = this.itemPromotionRepository.create({
      itemId: item.id,
      storeId: item.store.id,
      durationDays: dto.durationDays,
      amountPaid: dto.amountPaid,
      paymentReference: dto.paymentReference,
      paymentProofUrl: dto.paymentProofUrl,
      status: ItemPromotionStatus.PENDING,
    });

    return this.itemPromotionRepository.save(promotion);
  }

  /**
   * Obtiene el listado de promociones para revisión del administrador.
   */
  async getPromotionsForAdmin(status?: ItemPromotionStatus): Promise<ItemPromotion[]> {
    const query = this.itemPromotionRepository
      .createQueryBuilder('promo')
      .leftJoinAndSelect('promo.item', 'item')
      .leftJoinAndSelect('promo.store', 'store')
      .leftJoinAndSelect('store.company', 'company')
      .orderBy('promo.createdAt', 'DESC');

    if (status) {
      query.where('promo.status = :status', { status });
    }

    return query.getMany();
  }

  /**
   * Aprueba una solicitud de promoción de un artículo.
   */
  async approvePromotion(promotionId: string, adminUser: User): Promise<ItemPromotion> {
    const promo = await this.itemPromotionRepository.findOne({
      where: { id: promotionId },
      relations: ['item', 'store'],
    });

    if (!promo) {
      throw new NotFoundException('Solicitud de promoción no encontrada.');
    }

    if (promo.status !== ItemPromotionStatus.PENDING) {
      throw new BadRequestException('Esta solicitud ya fue procesada anteriormente.');
    }

    const now = new Date();
    promo.status = ItemPromotionStatus.APPROVED;
    promo.startsAt = now;
    promo.expiresAt = new Date(now.getTime() + promo.durationDays * 24 * 60 * 60 * 1000);
    promo.approvedAt = now;

    const saved = await this.itemPromotionRepository.save(promo);

    // Marca el artículo como destacado
    if (promo.item) {
      promo.item.isFeatured = true;
      await this.itemRepository.save(promo.item);
    }

    return saved;
  }

  /**
   * Rechaza una solicitud de promoción con motivo.
   */
  async rejectPromotion(
    promotionId: string,
    reason: string,
    adminUser: User,
  ): Promise<ItemPromotion> {
    const promo = await this.itemPromotionRepository.findOne({
      where: { id: promotionId },
    });

    if (!promo) {
      throw new NotFoundException('Solicitud de promoción no encontrada.');
    }

    if (promo.status !== ItemPromotionStatus.PENDING) {
      throw new BadRequestException('Esta solicitud ya fue procesada anteriormente.');
    }

    promo.status = ItemPromotionStatus.REJECTED;
    promo.adminNote = reason || 'Rechazado por administración';

    return this.itemPromotionRepository.save(promo);
  }

  /**
   * Devuelve el estado de monitoreo de la vitrina en tiempo real para el admin web.
   */
  async getShowcaseStatusForAdmin(): Promise<any> {
    const [config, showcase, pendingCount, activeCount] = await Promise.all([
      this.platformSettingsService.getFeaturedShowcaseConfig(),
      this.getFeaturedShowcase(),
      this.itemPromotionRepository.count({
        where: { status: ItemPromotionStatus.PENDING },
      }),
      this.itemPromotionRepository
        .createQueryBuilder('p')
        .where('p.status = :status', { status: ItemPromotionStatus.APPROVED })
        .andWhere('p.expiresAt > :now', { now: new Date() })
        .getCount(),
    ]);

    return {
      config,
      showcase,
      metrics: {
        pendingRequests: pendingCount,
        activePromotions: activeCount,
        totalItemsInShowcase: showcase.items.length,
        featuredPaidCount: showcase.items.filter((i: any) => i.isFeaturedAd).length,
        fallbackCount: showcase.items.filter((i: any) => i.isFallback).length,
      },
    };
  }

  /**
   * Consulta el estado de promoción de un artículo específico para la app de empresa.
   */
  async getItemPromotionStatus(
    itemId: string,
    user: User,
  ): Promise<{
    hasActivePromotion: boolean;
    activePromotion: ItemPromotion | null;
    pendingPromotion: ItemPromotion | null;
  }> {
    const now = new Date();
    const [active, pending] = await Promise.all([
      this.itemPromotionRepository
        .createQueryBuilder('p')
        .where('p.itemId = :itemId', { itemId })
        .andWhere('p.status = :status', { status: ItemPromotionStatus.APPROVED })
        .andWhere('p.expiresAt > :now', { now })
        .orderBy('p.expiresAt', 'DESC')
        .getOne(),
      this.itemPromotionRepository.findOne({
        where: { itemId, status: ItemPromotionStatus.PENDING },
        order: { createdAt: 'DESC' },
      }),
    ]);

    return {
      hasActivePromotion: Boolean(active),
      activePromotion: active,
      pendingPromotion: pending,
    };
  }

  /**
   * Marca como expiradas las promociones aprobadas cuya fecha de vencimiento haya pasado.
   */
  async expireExpiredPromotions(): Promise<number> {
    const now = new Date();
    const expiredList = await this.itemPromotionRepository
      .createQueryBuilder('p')
      .innerJoinAndSelect('p.item', 'item')
      .where('p.status = :status', { status: ItemPromotionStatus.APPROVED })
      .andWhere('p.expiresAt <= :now', { now })
      .getMany();

    if (expiredList.length === 0) return 0;

    for (const promo of expiredList) {
      promo.status = ItemPromotionStatus.EXPIRED;
      await this.itemPromotionRepository.save(promo);

      const otherActive = await this.itemPromotionRepository.count({
        where: {
          itemId: promo.itemId,
          status: ItemPromotionStatus.APPROVED,
        },
      });
      if (otherActive === 0 && promo.item) {
        promo.item.isFeatured = false;
        await this.itemRepository.save(promo.item);
      }
    }

    return expiredList.length;
  }
}
