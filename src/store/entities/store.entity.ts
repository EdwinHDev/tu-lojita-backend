import { PrimaryGeneratedColumn, Column, Entity, CreateDateColumn, UpdateDateColumn, ManyToOne, OneToMany, BeforeInsert, BeforeUpdate } from "typeorm";
import { StoreCategory } from "src/store-category/entities/store-category.entity";
import { Subcategory } from "src/subcategory/entities/subcategory.entity";
import { Company } from "src/company/entities/company.entity";
import { User } from "src/user/entities/user.entity";
import { Item } from "src/item/entities/item.entity";
import { StoreAddress } from "src/store-address/entities/store-address.entity";
import { Payment } from "src/payment/entities/payment.entity";
import { Order } from "src/order/entities/order.entity";
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

  @Column('text')
  logo: string;

  // Relación con la empresa a la que pertenece la tienda (Opcional)
  @ManyToOne(() => Company, (company) => company.stores, { nullable: true })
  company?: Company;

  // Relación con la subcategoría de la tienda
  @ManyToOne(() => Subcategory, (subcategory) => subcategory.stores)
  subcategory: Subcategory;

  // Propietario de la tienda (usuario que la creó)
  @ManyToOne(() => User, { nullable: true })
  owner?: User;

  @Column('text', {
    unique: true,
    nullable: false
  })
  slug: string;

  @OneToMany(() => StoreAddress, (address) => address.store)
  addresses: StoreAddress[];

  @OneToMany(() => Item, (item) => item.store)
  items: Item[];

  @OneToMany(() => StoreCategory, (storeCategory) => storeCategory.store)
  storeCategories: StoreCategory[];

  @OneToMany(() => Payment, (payment) => payment.store)
  payments: Payment[];

  @OneToMany(() => Order, (order) => order.store)
  orders: Order[];

  // Configuración de Pagos Parciales
  @Column('boolean', { default: false })
  allowPartialPayments: boolean;

  @Column('decimal', { precision: 5, scale: 2, default: 0 })
  partialPaymentsFeePercentage: number;

  @Column('decimal', { precision: 5, scale: 2, default: 0 })
  minInitialPaymentPercentage: number;

  @Column('int', { default: 0 })
  maxInstallments: number;

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
