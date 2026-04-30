import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { StoreCategory } from 'src/store-category/entities/store-category.entity';
import { PropertyType } from '../types/property-type.enum';

@Entity('item_property_templates')
export class ItemPropertyTemplate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('text')
  name: string;

  @Column('enum', {
    enum: PropertyType,
    default: PropertyType.TEXT,
  })
  type: PropertyType;

  @Column('boolean', { default: false })
  isRequired: boolean;

  @Column('jsonb', { nullable: true, default: {} })
  config: {
    unit?: string;
    options?: string[];
  };

  @ManyToOne(() => StoreCategory, { onDelete: 'CASCADE' })
  category: StoreCategory;

  @CreateDateColumn()
  createdAt: string;

  @UpdateDateColumn()
  updatedAt: string;
}
