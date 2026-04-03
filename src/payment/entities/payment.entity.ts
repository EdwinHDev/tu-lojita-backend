import { Column, CreateDateColumn, Entity, ManyToOne, OneToOne, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { Store } from "src/store/entities/store.entity";
import { User } from "src/user/entities/user.entity";
import { Order } from "src/order/entities/order.entity";
import { PaymentStatus } from "../types";

@Entity({ name: 'payments' })
export class Payment {

  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('decimal', { precision: 12, scale: 2 })
  amount: number;

  @Column('text')
  currency: string; // Ej: 'USD' | 'VES'

  @Column({
    type: 'enum',
    enum: PaymentStatus,
    default: PaymentStatus.PENDING,
  })
  status: PaymentStatus;

  @Column('text')
  paymentMethod: string; // Ej: 'ZELLE' | 'PAGO_MOVIL'

  @Column('text', { nullable: true })
  reference: string;

  @Column('text', { nullable: true })
  receiptImage: string;

  @CreateDateColumn()
  createdAt: string;

  @UpdateDateColumn()
  updatedAt: string;

  @ManyToOne(() => Store, (store) => store.payments)
  store: Store;

  @ManyToOne(() => User, (user) => user.payments)
  user: User;

  @ManyToOne(() => Order, (order) => order.payments)
  order: Order;

}
