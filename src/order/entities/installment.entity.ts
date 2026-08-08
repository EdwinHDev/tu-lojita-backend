import {
  Column,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { TimestampEntity } from 'src/common/entities/timestamp.entity';
import { Order } from './order.entity';
import { InstallmentStatus, ExtensionStatus } from '../types';

@Entity({ name: 'installments' })
export class Installment extends TimestampEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('decimal', { precision: 12, scale: 2, default: 0 })
  amount: number;

  @Column('decimal', { precision: 12, scale: 2, default: 0 })
  paidAmount: number;

  @Column({ type: 'timestamptz', nullable: true })
  paymentDate?: Date | null;

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

  @Column({
    type: 'enum',
    enum: ExtensionStatus,
    default: ExtensionStatus.NONE,
  })
  extensionStatus: ExtensionStatus;

  @Column('int', { nullable: true })
  extensionRequestedDays?: number | null;

  @Column('text', { nullable: true })
  extensionReason?: string | null;

  @Column('text', { nullable: true })
  extensionMerchantComment?: string | null;

  @ManyToOne(() => Order, (order) => order.installments, { onDelete: 'CASCADE' })
  order: Order;
}
