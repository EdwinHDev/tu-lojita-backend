import { PrimaryGeneratedColumn, Column, Entity, CreateDateColumn, UpdateDateColumn, ManyToOne, OneToMany, BeforeInsert, BeforeUpdate } from "typeorm";
import { StoreCategory } from "src/store-category/entities/store-category.entity";
import { Category } from "src/category/entities/category.entity";
import { Company } from "src/company/entities/company.entity";
import { User } from "src/user/entities/user.entity";
import { Item } from "src/item/entities/item.entity";
import slugify from "slugify";

@Entity('stores')
export class Store {

  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('text')
  name: string;

  @Column('text')
  description: string;

  @Column('text')
  rif: string;

  @Column('text')
  phone: string;

  @Column('text', {
    nullable: true
  })
  address: string;

  @Column('text', {
    nullable: true
  })
  city: string;

  @Column('text', {
    nullable: true
  })
  state: string;

  @Column('text')
  logo: string;

  // Relación con la empresa a la que pertenece la tienda (Opcional)
  @ManyToOne(() => Company, (company) => company.stores, { nullable: true })
  company?: Company;

  // Relación con la categoría de la tienda
  @ManyToOne(() => Category, (category) => category.stores)
  category: Category;

  // Propietario de la tienda (usuario que la creó)
  @ManyToOne(() => User, { nullable: true })
  owner?: User;

  @Column('text', {
    unique: true,
    nullable: false
  })
  slug: string;

  @OneToMany(() => Item, (item) => item.store)
  items: Item[];

  @OneToMany(() => StoreCategory, (storeCategory) => storeCategory.store)
  storeCategories: StoreCategory[];

  @CreateDateColumn()
  createdAt: string;

  @UpdateDateColumn()
  updatedAt: string;

  @BeforeInsert()
  checkSlugInsert() {
    this.slug = slugify(this.name, {
      lower: true,
      trim: true,
      replacement: '-',
      remove: /[^a-zA-Z0-9]/g,
    });
  }

  @BeforeUpdate()
  checkSlugUpdate() {
    this.slug = slugify(this.name, {
      lower: true,
      trim: true,
      replacement: '-',
      remove: /[^a-zA-Z0-9]/g,
    });
  }

}
