import {
  Column,
  Entity,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { TimestampEntity } from 'src/common/entities/timestamp.entity';
import { Store } from 'src/store/entities/store.entity';
import { BillingStatus } from '../types';
import { CommissionPaymentReport } from './commission-payment-report.entity';

@Entity('store_commission_billings')
export class StoreCommissionBilling extends TimestampEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Store, { onDelete: 'CASCADE' })
  store: Store;

  @Column({ type: 'timestamptz' })
  periodStartDate: Date;

  @Column({ type: 'timestamptz' })
  periodEndDate: Date;

  @Column('decimal', { precision: 12, scale: 2, default: 0 })
  totalSalesAmount: number;

  @Column('decimal', { precision: 12, scale: 2, default: 0 })
  commissionAmount: number;

  @Column('decimal', { precision: 12, scale: 2, default: 0 })
  fineAmount: number;

  @Column('decimal', { precision: 12, scale: 2, default: 0 })
  totalDue: number;

  @Column('decimal', { precision: 12, scale: 2, default: 0 })
  paidAmount: number;

  @Column({ type: 'timestamptz' })
  dueDate: Date;

  @Column({ type: 'timestamptz' })
  gracePeriodEndDate: Date;

  @Column({
    type: 'enum',
    enum: BillingStatus,
    default: BillingStatus.PENDING,
  })
  status: BillingStatus;

  @Column('jsonb', { nullable: true, default: [] })
  associatedOrderIds: string[];

  @OneToMany(() => CommissionPaymentReport, (report) => report.billing)
  paymentReports: CommissionPaymentReport[];
}
