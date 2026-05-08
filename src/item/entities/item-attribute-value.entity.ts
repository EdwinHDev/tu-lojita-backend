import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { Item } from './item.entity';

@Entity('item_attribute_values')
export class ItemAttributeValue {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('text')
  key: string;

  @Column('text', { nullable: true })
  type: string;

  @Column('jsonb')
  value: any;

  @ManyToOne(() => Item, (item) => item.attributesRel, { onDelete: 'CASCADE' })
  item: Item;
}
