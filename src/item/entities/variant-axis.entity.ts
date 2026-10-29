import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { Item } from './item.entity';

@Entity('variant_axes')
export class VariantAxis {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('text')
  name: string;

  @Column({ type: 'text', array: true, default: [] })
  values: string[];

  @Column('int', { default: 0 })
  position: number;

  @ManyToOne(() => Item, (item) => item.variantAxes, {
    onDelete: 'CASCADE',
  })
  item: Item;
}
