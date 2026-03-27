import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { Store } from "src/store/entities/store.entity";
import { Item } from "src/item/entities/item.entity";

@Entity('store_categories')
export class StoreCategory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('text')
  name: string;

  @Column('text')
  description: string;

  @ManyToOne(() => Store, (store) => store.storeCategories)
  @JoinColumn({ name: 'store_id' })
  store: Store;

  @OneToMany(() => Item, (item) => item.category)
  items: Item[];

  @CreateDateColumn()
  createdAt: string;

  @UpdateDateColumn()
  updatedAt: string;
}
