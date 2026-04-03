import { BeforeInsert, BeforeUpdate, Column, CreateDateColumn, Entity, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import * as bcrypt from 'bcrypt';
import { UserRole } from "../types";
import { Address } from "src/address/entities/address.entity";
import { Company } from "src/company/entities/company.entity";
import { Store } from "src/store/entities/store.entity";
import { Order } from "src/order/entities/order.entity";
import { Payment } from "src/payment/entities/payment.entity";

@Entity('users')
export class User {

  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('text')
  firstName: string;

  @Column('text', {
    nullable: true
  })
  lastName?: string;

  @Column('text', {
    unique: true
  })
  email: string;

  @Column('text', {
    unique: true,
    nullable: true
  })
  googleId: string;

  @Column('text', {
    nullable: true
  })
  avatarUrl: string;

  @Column({ type: 'text', select: false, nullable: true })
  password: string;

  @Column('bool', {
    default: true
  })
  isActive: boolean;

  @Column('bool', {
    default: false,
    select: false
  })
  confirm: boolean;

  @Column('text', {
    select: false,
    nullable: true
  })
  confirmToken?: string;

  @Column({
    type: 'enum',
    enum: UserRole,
    default: UserRole.USER
  })
  role: UserRole;

  @CreateDateColumn()
  createdAt: string;

  @UpdateDateColumn()
  updatedAt: string;

  @OneToMany(() => Address, (address) => address.user)
  addresses: Address[];

  // Relación con la empresa (para usuarios con rol COMPANY)
  @ManyToOne(() => Company, { nullable: true })
  company?: Company;

  // Relación con la tienda (para usuarios con rol VENDOR)
  @ManyToOne(() => Store, { nullable: true })
  store?: Store;

  @OneToMany(() => Order, (order) => order.user)
  orders: Order[];

  @OneToMany(() => Payment, (payment) => payment.user)
  payments: Payment[];

  @BeforeInsert()
  @BeforeUpdate()
  beforeInsert() {
    this.email = this.email.toLowerCase().trim();
    if (this.password) {
      this.password = bcrypt.hashSync(this.password, 10);
    }
  }

}
