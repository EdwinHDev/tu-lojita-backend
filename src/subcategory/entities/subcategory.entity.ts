import {
  Column,
  Entity,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { TimestampEntity } from 'src/common/entities/timestamp.entity';
import { Category } from 'src/category/entities/category.entity';
import { Store } from 'src/store/entities/store.entity';

@Entity('subcategories')
export class Subcategory extends TimestampEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'text' })
  imageUrl: string;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @ManyToOne(() => Category, (category) => category.subcategories, {
    nullable: false,
  })
  category: Category;

  @OneToMany(() => Store, (store) => store.subcategory)
  stores: Store[];
}
