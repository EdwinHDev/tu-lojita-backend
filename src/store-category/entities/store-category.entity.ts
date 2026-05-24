import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { TimestampEntity } from 'src/common/entities/timestamp.entity';
import { Store } from 'src/store/entities/store.entity';
import { Item } from 'src/item/entities/item.entity';
import { ItemPropertyTemplate } from 'src/item/entities/item-property-template.entity';

@Entity('store_categories')
export class StoreCategory extends TimestampEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text' })
  name: string;

  @Column('text')
  description: string;

  @ManyToOne(() => Store, (store) => store.storeCategories)
  @JoinColumn({ name: 'store_id' })
  store: Store;

  @OneToMany(() => Item, (item) => item.category)
  items: Item[];

  @OneToMany(() => ItemPropertyTemplate, (template) => template.category)
  propertyTemplates: ItemPropertyTemplate[];


}
