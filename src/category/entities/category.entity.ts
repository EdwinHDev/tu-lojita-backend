import { PrimaryGeneratedColumn, Column, Entity, CreateDateColumn, UpdateDateColumn, OneToMany } from "typeorm";
import { Store } from "src/store/entities/store.entity";

@Entity('categories')
export class Category {

  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('text')
  name: string;

  @Column('text')
  description: string;

  @Column('text')
  image: string;

  // Relación con tiendas: Una categoría puede ser usada por varias tiendas
  @OneToMany(() => Store, (store) => store.category)
  stores: Store[];

  @CreateDateColumn()
  createdAt: string;

  @UpdateDateColumn()
  updatedAt: string;

}
