import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { TimestampEntity } from 'src/common/entities/timestamp.entity';

@Entity('subscription_settings')
export class SubscriptionSettings extends TimestampEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('decimal', { precision: 12, scale: 2, default: 20.0 })
  monthlyFee: number;

  @Column('int', { default: 3 })
  gracePeriodDays: number;

  @Column('decimal', { precision: 12, scale: 2, default: 5.0 })
  lateFee: number;

  @Column('boolean', { default: true })
  isActive: boolean;
}
