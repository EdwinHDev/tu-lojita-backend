import { Column, CreateDateColumn, Entity, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { Store } from "src/store/entities/store.entity";
import { User } from "src/user/entities/user.entity";
import { Payment } from "src/payment/entities/payment.entity";
import { OrderItem } from "src/order-item/entities/order-item.entity";
import { OrderStatus } from "../types";

@Entity({ name: 'orders' })
export class Order {

  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('decimal', { precision: 12, scale: 2, default: 0 })
  totalAmount: number;

  @Column('decimal', { precision: 12, scale: 2, default: 0 })
  feeAmount: number;

  @Column('decimal', { precision: 12, scale: 2, default: 0 })
  finalAmount: number;

  @Column('decimal', { precision: 12, scale: 2, default: 0 })
  balance: number;

  @Column('boolean', { default: false })
  isPartialPayment: boolean;

  @Column({
    type: 'enum',
    enum: OrderStatus,
    default: OrderStatus.PENDING,
  })
  status: OrderStatus;

  @Column('int', { nullable: true })
  monthlyDueDay?: number | null;

  @Column('date', { nullable: true })
  nextDueDate?: Date | null;

  @CreateDateColumn()
  createdAt: string;

  @UpdateDateColumn()
  updatedAt: string;

  // Relación con la tienda
  @ManyToOne(() => Store, (store) => store.orders)
  store: Store;

  // Cliente que realizó la orden
  @ManyToOne(() => User, (user) => user.orders)
  user: User;

  @OneToMany(() => OrderItem, (orderItem) => orderItem.order)
  orderItems: OrderItem[];

  // Lista de abonos/pagos realizados a esta orden
  @OneToMany(() => Payment, (payment) => payment.order)
  payments: Payment[];

}
