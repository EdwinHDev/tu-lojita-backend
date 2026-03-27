import { Column, CreateDateColumn, Entity, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { ItemType } from "../types/item-type.enum";
import { ItemAttributes } from "../types/item-attributes.interface";
import { Store } from "src/store/entities/store.entity";
import { StoreCategory } from "src/store-category/entities/store-category.entity";

/**
 * Entidad núcleo de la plataforma comercial.
 * Representa cualquier elemento que una tienda pueda ofrecer, unificando bajo 
 * una misma estructura tanto productos físicos (que se envían y agotan) 
 * como servicios (que se agendan o proveen de forma continua).
 */
@Entity('items')
export class Item {

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
    }
  })
  price: number;

  @Column('text', { array: true, default: [] })
  images: string[];

  /**
   * Clasificador principal del elemento.
   * Dicta las reglas de negocio base: un PRODUCT normalmente requiere cálculo de envío,
   * mientras que un SERVICE ignora la logística de transporte.
   */
  @Column('enum', {
    enum: ItemType,
    default: ItemType.PRODUCT
  })
  itemType: ItemType;

  /**
   * CONTROL DE COMPORTAMIENTO: INVENTARIO
   * - true: El sistema debe validar que `stockQuantity > 0` antes de permitir la venta y restarlo al confirmar.
   * - false: El elemento tiene disponibilidad ilimitada (ej. un servicio digital, o una tienda que asume stock infinito).
   */
  @Column('boolean', {
    default: true
  })
  trackInventory: boolean;

  /**
   * CANTIDAD DISPONIBLE
   * Representa las unidades físicas en el almacén de la tienda.
   * Importante: El código solo debe tomar en cuenta este valor si `trackInventory` es true.
   */
  @Column('numeric', {
    default: 0,
    nullable: true
  })
  stockQuantity?: number;

  /**
   * CONTROL DE COMPORTAMIENTO: AGENDA / RESERVA
   * - true: Cambia el flujo de UI/UX. En lugar de "Agregar al carrito", obliga al usuario a seleccionar fecha y hora.
   * - false: El elemento es de consumo o despacho inmediato (comportamiento clásico de e-commerce).
   */
  @Column('boolean', {
    default: false
  })
  requiresBooking: boolean;

  @Column('jsonb', { nullable: true, default: {} })
  attributes: ItemAttributes;

  @ManyToOne(() => Store, (store) => store.items)
  store: Store;

  @ManyToOne(() => StoreCategory, (category) => category.items, { nullable: true })
  category: StoreCategory;

  @CreateDateColumn()
  createdAt: string;

  @UpdateDateColumn()
  updatedAt: string;
}