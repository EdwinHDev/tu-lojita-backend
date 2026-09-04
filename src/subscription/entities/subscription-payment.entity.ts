import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { TimestampEntity } from 'src/common/entities/timestamp.entity';
import { User } from 'src/user/entities/user.entity';
import { PlatformPaymentMethod } from 'src/commission/entities/platform-payment-method.entity';
import { CompanySubscription } from './company-subscription.entity';
import { SubscriptionPaymentStatus } from '../types';

@Entity('subscription_payments')
export class SubscriptionPayment extends TimestampEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => CompanySubscription, (s) => s.payments, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'subscriptionId' })
  subscription: CompanySubscription;

  @Column({ type: 'uuid', nullable: true })
  subscriptionId: string;

  @Column('decimal', { precision: 12, scale: 2 })
  amount: number;

  @ManyToOne(() => PlatformPaymentMethod)
  @JoinColumn({ name: 'paymentMethodId' })
  paymentMethod: PlatformPaymentMethod;

  @Column({ type: 'uuid', nullable: true })
  paymentMethodId: string;

  @Column('text')
  referenceNumber: string;

  @Column('text')
  receiptImageUrl: string;

  @Column({
    type: 'enum',
    enum: SubscriptionPaymentStatus,
    default: SubscriptionPaymentStatus.PENDING_VERIFICATION,
  })
  status: SubscriptionPaymentStatus;

  @Column('text', { nullable: true })
  rejectionReason?: string | null;

  @ManyToOne(() => User, { nullable: true })
  reviewedBy?: User | null;

  @Column({ type: 'timestamptz', nullable: true })
  reviewedAt?: Date | null;
}
