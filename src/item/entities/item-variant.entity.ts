import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import { Item } from './item.entity';
import { OrderItem } from 'src/order-item/entities/order-item.entity';

@Entity('item_variants')
export class ItemVariant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('text', { nullable: true })
  sku?: string;

  @Column('numeric', {
    nullable: true,
    transformer: {
      to: (value: number) => value,
      from: (value: string) =>
        value !== null && value !== undefined ? parseFloat(value) : null,
    },
  })
  price?: number;

  @Column('numeric', {
    nullable: true,
    transformer: {
      to: (value: number) => value,
      from: (value: string) =>
        value !== null && value !== undefined ? parseFloat(value) : null,
    },
  })
  discountPrice?: number;

  @Column('numeric', {
    default: 0,
    transformer: {
      to: (value: number) => value,
      from: (value: string) =>
        value !== null && value !== undefined ? parseFloat(value) : 0,
    },
  })
  stockQuantity: number;

  @Column('boolean', { default: true })
  isActive: boolean;

  @Column('jsonb', { default: {} })
  axisValues: Record<string, string>;

  @Column('text', { nullable: true })
  imageUrl?: string;

  @ManyToOne(() => Item, (item) => item.variants, {
    onDelete: 'CASCADE',
  })
  item: Item;

  @OneToMany(() => OrderItem, (orderItem) => orderItem.variant)
  orderItems: OrderItem[];
}
