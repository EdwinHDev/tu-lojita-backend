import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { TimestampEntity } from 'src/common/entities/timestamp.entity';
import { User } from 'src/user/entities/user.entity';
import { StoreCommissionBilling } from './store-commission-billing.entity';
import { PlatformPaymentMethod } from './platform-payment-method.entity';
import { PaymentReportStatus } from '../types';

@Entity('commission_payment_reports')
export class CommissionPaymentReport extends TimestampEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => StoreCommissionBilling, (b) => b.paymentReports, {
    onDelete: 'CASCADE',
  })
  billing: StoreCommissionBilling;

  @Column('decimal', { precision: 12, scale: 2 })
  amount: number;

  @ManyToOne(() => PlatformPaymentMethod)
  paymentMethod: PlatformPaymentMethod;

  @Column('text')
  referenceNumber: string;

  @Column('text')
  receiptImageUrl: string;

  @Column({
    type: 'enum',
    enum: PaymentReportStatus,
    default: PaymentReportStatus.PENDING_REVIEW,
  })
  status: PaymentReportStatus;

  @Column('text', { nullable: true })
  rejectionReason?: string | null;

  @ManyToOne(() => User, { nullable: true })
  reviewedBy?: User | null;

  @Column({ type: 'timestamptz', nullable: true })
  reviewedAt?: Date | null;
}
