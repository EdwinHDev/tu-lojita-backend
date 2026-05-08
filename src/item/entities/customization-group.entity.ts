import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import { Item } from './item.entity';
import { CustomizationOption } from './customization-option.entity';

@Entity('customization_groups')
export class CustomizationGroup {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('text')
  name: string;

  @Column('int', { default: 0 })
  minSelect: number;

  @Column('int', { default: 0 })
  maxSelect: number;

  @Column('boolean', { default: false })
  allowOptionQuantity: boolean;

  @ManyToOne(() => Item, (item) => item.customizationGroupsRel, {
    onDelete: 'CASCADE',
  })
  item: Item;

  @OneToMany(() => CustomizationOption, (option) => option.group, {
    cascade: true,
  })
  options: CustomizationOption[];
}
