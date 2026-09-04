import {
  Column,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { TimestampEntity } from 'src/common/entities/timestamp.entity';
import { Store } from 'src/store/entities/store.entity';
import { User } from 'src/user/entities/user.entity';
import { Order } from 'src/order/entities/order.entity';
import { PaymentStatus } from '../types';

@Entity({ name: 'payments' })
export class Payment extends TimestampEntity {
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

  @Column('text', { nullable: true })
  rejectionReason: string | null;

  @Column('int', { nullable: true })
  installmentIndex: number | null;

  @ManyToOne(() => Store, (store) => store.payments)
  store: Store;

  @ManyToOne(() => User, (user) => user.payments)
  user: User;

  @ManyToOne(() => Order, (order) => order.payments)
  order: Order;
}
