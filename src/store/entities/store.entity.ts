import {
  PrimaryGeneratedColumn,
  Column,
  Entity,
  ManyToOne,
  OneToMany,
  BeforeInsert,
  BeforeUpdate,
} from 'typeorm';
import { TimestampEntity } from 'src/common/entities/timestamp.entity';
import { StoreCategory } from 'src/store-category/entities/store-category.entity';
import { Subcategory } from 'src/subcategory/entities/subcategory.entity';
import { Company } from 'src/company/entities/company.entity';
import { User } from 'src/user/entities/user.entity';
import { Item } from 'src/item/entities/item.entity';
import { StoreAddress } from 'src/store-address/entities/store-address.entity';
import { Payment } from 'src/payment/entities/payment.entity';
import { Order } from 'src/order/entities/order.entity';
import { StorePaymentMethod } from 'src/store-payment-method/entities/store-payment-method.entity';
import slugify from 'slugify';
import { StoreStatus } from '../types/status.enum';
import { InstallmentPeriod } from '../types/installment-period.enum';

@Entity('stores')
export class Store extends TimestampEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('text')
  name: string;

  @Column('text', { nullable: true })
  branchName?: string;

  @Column('text')
  description: string;

  @Column('text')
  rif: string;

  @Column('text')
  phone: string;

  @Column('text')
  logo: string;

  @Column('text', { nullable: true })
  coverImage?: string;

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
    nullable: false,
  })
  slug: string;

  @Column('enum', {
    enum: StoreStatus,
    default: StoreStatus.ACTIVE,
  })
  status: StoreStatus;

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

  @OneToMany(() => StorePaymentMethod, (method) => method.store)
  paymentMethodConfigs: StorePaymentMethod[];

  // Configuración de Pagos Parciales
  @Column('boolean', { default: false })
  allowPartialPayments: boolean;

  @Column('decimal', { precision: 5, scale: 2, default: 0 })
  partialPaymentsFeePercentage: number;

  @Column('decimal', { precision: 5, scale: 2, default: 0 })
  minInitialPaymentPercentage: number;

  @Column('int', { default: 0 })
  maxInstallments: number;

  @Column('decimal', { precision: 10, scale: 2, nullable: true })
  maxCreditLimit: number;

  @Column('boolean', { default: true })
  allowChat: boolean;

  @Column('int', { default: 7, nullable: true })
  installmentIntervalValue: number;

  @Column('enum', {
    enum: InstallmentPeriod,
    default: InstallmentPeriod.DAYS,
    nullable: true,
  })
  installmentIntervalUnit: InstallmentPeriod;

  @Column('jsonb', { nullable: true })
  installmentFrequencyOptions?: { value: number; unit: InstallmentPeriod; label: string }[];

  @Column('boolean', { default: false })
  allowInstallmentExtensions: boolean;

  @Column('int', { default: 7, nullable: true })
  maxExtensionDays: number;

  @Column('jsonb', {
    nullable: true,
    default: ['PAGO_MOVIL', 'TRANSFER', 'BINANCE'],
  })
  paymentMethods: string[];

  @Column('text', { default: 'America/Caracas' })
  timezone: string;

  @BeforeInsert()
  checkSlugInsert() {
    const slugBase = this.branchName
      ? `${this.name} ${this.branchName}`
      : this.name;
    this.slug = slugify(slugBase, {
      lower: true,
      trim: true,
      replacement: '-',
      remove: /[^a-zA-Z0-9]/g,
    });
  }

  @BeforeUpdate()
  checkSlugUpdate() {
    const slugBase = this.branchName
      ? `${this.name} ${this.branchName}`
      : this.name;
    this.slug = slugify(slugBase, {
      lower: true,
      trim: true,
      replacement: '-',
      remove: /[^a-zA-Z0-9]/g,
    });
  }
}
