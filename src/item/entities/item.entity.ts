import {
  Column,
  Entity,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { TimestampEntity } from 'src/common/entities/timestamp.entity';
import { ItemType } from '../types/item-type.enum';
import { PriceType } from '../types/price-type.enum';
import { ItemAttributes } from '../types/item-attributes.interface';
import { Store } from 'src/store/entities/store.entity';
import { StoreCategory } from 'src/store-category/entities/store-category.entity';
import { CustomizationGroup } from './customization-group.entity';
import { ItemAttributeValue } from './item-attribute-value.entity';

/**
 * Entidad núcleo de la plataforma comercial.
 * Representa cualquier elemento que una tienda pueda ofrecer, unificando bajo
 * una misma estructura tanto productos físicos (que se envían y agotan)
 * como servicios (que se agendan o proveen de forma continua).
 */
@Entity('items')
export class Item extends TimestampEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('text')
  title: string;

  @Column('text')
  description: string;

  /**
   * Precio base de venta.
   * Nota: Se usa 'numeric' para evitar problemas de precisión con decimales
   * (muy común si se usara 'float' para dinero).
   */
  @Column('numeric', {
    default: 0,
    transformer: {
      to: (value: number) => value,
      from: (value: string) => parseFloat(value),
    },
  })
  price: number;

  /**
   * Tipo de precio (Fijo o con base "Desde").
   */
  @Column('enum', {
    enum: PriceType,
    default: PriceType.FIXED,
  })
  priceType: PriceType;

  @Column('text')
  mainImage: string;

  @Column({ type: 'text', array: true, default: [] })
  images: string[];

  /**
   * DESTACADO: Permite resaltar productos en el Home o secciones especiales.
   */
  @Column('boolean', {
    default: false,
  })
  isFeatured: boolean;

  /**
   * PRECIO DE OFERTA: Si está presente, indica que el producto tiene un descuento activo.
   */
  @Column('numeric', {
    nullable: true,
    transformer: {
      to: (value: number) => value,
      from: (value: string) => (value ? parseFloat(value) : null),
    },
  })
  discountPrice?: number;

  /**
   * Clasificador principal del elemento.
   * Dicta las reglas de negocio base: un PRODUCT normalmente requiere cálculo de envío,
   * mientras que un SERVICE ignora la logística de transporte.
   */
  @Column('enum', {
    enum: ItemType,
    default: ItemType.PRODUCT,
  })
  itemType: ItemType;

  /**
   * CONTROL DE COMPORTAMIENTO: INVENTARIO
   * - true: El sistema debe validar que `stockQuantity > 0` antes de permitir la venta y restarlo al confirmar.
   * - false: El elemento tiene disponibilidad ilimitada (ej. un servicio digital, o una tienda que asume stock infinito).
   */
  @Column('boolean', {
    default: true,
  })
  trackInventory: boolean;

  /**
   * CANTIDAD DISPONIBLE
   * Representa las unidades físicas en el almacén de la tienda.
   * Importante: El código solo debe tomar en cuenta este valor si `trackInventory` es true.
   */
  @Column('numeric', {
    default: 0,
    nullable: true,
    transformer: {
      to: (value: number) => value,
      from: (value: string) => (value ? parseFloat(value) : 0),
    },
  })
  stockQuantity?: number;

  /**
   * CONTROL DE COMPORTAMIENTO: AGENDA / RESERVA
   * - true: Cambia el flujo de UI/UX. En lugar de "Agregar al carrito", obliga al usuario a seleccionar fecha y hora.
   * - false: El elemento es de consumo o despacho inmediato (comportamiento clásico de e-commerce).
   */
  @Column('boolean', {
    default: false,
  })
  requiresBooking: boolean;

  @Column('jsonb', { nullable: true, default: {} })
  attributes: ItemAttributes;

  @Column('boolean', { default: true })
  allowInstallments: boolean;

  @Column('boolean', { default: true })
  isActive: boolean;

  @Column('numeric', {
    default: 0,
    transformer: {
      to: (value: number) => value,
      from: (value: string) => (value ? parseFloat(value) : 0),
    },
  })
  lateFeePercentage: number;

  @Column('jsonb', { nullable: true, default: [] })
  customizationGroups: any[];

  @OneToMany(() => CustomizationGroup, (group) => group.item, { cascade: true })
  customizationGroupsRel: CustomizationGroup[];

  @OneToMany(() => ItemAttributeValue, (attr) => attr.item, { cascade: true })
  attributesRel: ItemAttributeValue[];

  @ManyToOne(() => Store, (store) => store.items)
  store: Store;

  @ManyToOne(() => StoreCategory, (category) => category.items, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  category: StoreCategory;
}
