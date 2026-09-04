import {
  Column,
  Entity,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { TimestampEntity } from 'src/common/entities/timestamp.entity';
import { Store } from 'src/store/entities/store.entity';
import { User } from 'src/user/entities/user.entity';
import { Payment } from 'src/payment/entities/payment.entity';
import { OrderItem } from 'src/order-item/entities/order-item.entity';
import { OrderStatus } from '../types';
import { Installment } from './installment.entity';
import { InstallmentPeriod } from 'src/store/types/installment-period.enum';

@Entity({ name: 'orders' })
export class Order extends TimestampEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('decimal', { precision: 12, scale: 2, default: 0 })
  totalAmount: number;

  @Column('decimal', { precision: 12, scale: 2, default: 0 })
  feeAmount: number;

  @Column('decimal', { precision: 12, scale: 2, default: 0 })
  finalAmount: number;

  @Column('decimal', { precision: 5, scale: 2, default: 0 })
  platformCommissionRate: number;

  @Column('decimal', { precision: 12, scale: 2, default: 0 })
  platformCommissionAmount: number;

  @Column('boolean', { default: false })
  isCommissionVoided: boolean;

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

  @Column('text', { nullable: true })
  rejectionReason?: string;

  @Column('int', { nullable: true })
  monthlyDueDay?: number | null;

  @Column({ type: 'timestamptz', nullable: true })
  nextDueDate?: Date | null;

  @Column('int', { nullable: true })
  installmentIntervalValue?: number;

  @Column('enum', {
    enum: InstallmentPeriod,
    nullable: true,
  })
  installmentIntervalUnit?: InstallmentPeriod;

  @Column('decimal', { precision: 12, scale: 2, default: 0 })
  totalPaidAmount: number;

  @Column('decimal', { precision: 12, scale: 2, default: 0 })
  remainingBalance: number;

  @Column('boolean', { default: false })
  isFullyPaid: boolean;

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

  @OneToMany(() => Installment, (installment) => installment.order, {
    cascade: true,
  })
  installments: Installment[];
}
