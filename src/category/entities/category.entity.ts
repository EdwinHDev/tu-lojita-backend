import { PrimaryGeneratedColumn, Column, Entity, OneToMany } from 'typeorm';
import { TimestampEntity } from 'src/common/entities/timestamp.entity';
import { Store } from 'src/store/entities/store.entity';
import { Subcategory } from 'src/subcategory/entities/subcategory.entity';

@Entity('categories')
export class Category extends TimestampEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('text')
  name: string;

  @Column('text')
  description: string;

  @Column('text')
  image: string;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  // Relación con Subcategorías
  @OneToMany(() => Subcategory, (subcategory) => subcategory.category)
  subcategories: Subcategory[];
}
