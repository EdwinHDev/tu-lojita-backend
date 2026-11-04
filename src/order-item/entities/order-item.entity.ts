import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Order } from '../../order/entities/order.entity';
import { Item } from '../../item/entities/item.entity';
import { ItemVariant } from '../../item/entities/item-variant.entity';

@Entity('order_items')
export class OrderItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('text')
  title: string; // Snapshot del nombre del producto/servicio

  @Column('int')
  quantity: number;

  @Column('decimal', {
    precision: 12,
    scale: 2,
    default: 0,
    transformer: {
      to: (value: number) => value,
      from: (value: string) => (value !== null && value !== undefined ? parseFloat(value) : 0),
    },
  })
  basePrice: number; // Snapshot de la ganancia neta de la tienda al momento de la compra

  @Column('decimal', {
    precision: 5,
    scale: 2,
    default: 0,
    transformer: {
      to: (value: number) => value,
      from: (value: string) => (value !== null && value !== undefined ? parseFloat(value) : 0),
    },
  })
  commissionRate: number; // Snapshot de la tasa de comisión aplicada (%)

  @Column('decimal', {
    precision: 12,
    scale: 2,
    default: 0,
    transformer: {
      to: (value: number) => value,
      from: (value: string) => (value !== null && value !== undefined ? parseFloat(value) : 0),
    },
  })
  commissionAmount: number; // Snapshot del monto de comisión por unidad

  @Column('decimal', {
    precision: 12,
    scale: 2,
    transformer: {
      to: (value: number) => value,
      from: (value: string) => parseFloat(value),
    },
  })
  price: number; // Snapshot del precio público al momento de la compra

  @Column('jsonb', { nullable: true })
  selectedOptions?: Record<string, string[]>;

  @Column('uuid', { nullable: true })
  variantId?: string;

  @Column('text', { nullable: true })
  variantLabel?: string; // Snapshot de la combinación (ej: "Azul / M")

  @ManyToOne(() => Order, (order) => order.orderItems, { onDelete: 'CASCADE' })
  order: Order;

  @ManyToOne(() => Item)
  item: Item;

  @ManyToOne(() => ItemVariant, (variant) => variant.orderItems, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  variant?: ItemVariant;
}
