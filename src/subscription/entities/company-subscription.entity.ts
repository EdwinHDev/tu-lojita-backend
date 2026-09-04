import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { TimestampEntity } from 'src/common/entities/timestamp.entity';
import { Company } from 'src/company/entities/company.entity';
import { User } from 'src/user/entities/user.entity';
import { SubscriptionStatus } from '../types';
import { SubscriptionPayment } from './subscription-payment.entity';

@Entity('company_subscriptions')
export class CompanySubscription extends TimestampEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @OneToOne(() => Company, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn()
  company?: Company | null;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  owner: User;

  @Column('decimal', { precision: 12, scale: 2, default: 20.0 })
  monthlyFee: number;

  @Column({
    type: 'enum',
    enum: SubscriptionStatus,
    default: SubscriptionStatus.PAYMENT_REQUIRED,
  })
  status: SubscriptionStatus;

  @Column({ type: 'timestamptz', nullable: true })
  currentPeriodStart?: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  currentPeriodEnd?: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  gracePeriodEnd?: Date | null;

  @Column('decimal', { precision: 12, scale: 2, default: 0 })
  accumulatedDebt: number;

  @Column({ type: 'timestamptz', nullable: true })
  nextBillingDate?: Date | null;

  @OneToMany(() => SubscriptionPayment, (p) => p.subscription)
  payments: SubscriptionPayment[];
}
