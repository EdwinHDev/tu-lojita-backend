import {
  Column,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { TimestampEntity } from 'src/common/entities/timestamp.entity';
import { Order } from './order.entity';
import { InstallmentStatus } from '../types';

@Entity({ name: 'installments' })
export class Installment extends TimestampEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('decimal', { precision: 12, scale: 2, default: 0 })
  amount: number;

  @Column({ type: 'timestamptz' })
  dueDate: Date;

  @Column({
    type: 'enum',
    enum: InstallmentStatus,
    default: InstallmentStatus.PENDING,
  })
  status: InstallmentStatus;

  @Column('decimal', { precision: 12, scale: 2, default: 0 })
  lateFeeApplied: number;



  @ManyToOne(() => Order, (order) => order.installments, { onDelete: 'CASCADE' })
  order: Order;
}
