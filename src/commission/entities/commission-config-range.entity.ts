import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { TimestampEntity } from 'src/common/entities/timestamp.entity';

@Entity('commission_config_ranges')
export class CommissionConfigRange extends TimestampEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('decimal', { precision: 12, scale: 2, default: 0 })
  minAmount: number;

  @Column('decimal', { precision: 12, scale: 2, nullable: true })
  maxAmount?: number | null;

  @Column('decimal', { precision: 5, scale: 2, default: 0 })
  singlePaymentRate: number;

  @Column('decimal', { precision: 5, scale: 2, default: 0 })
  installmentPaymentRate: number;

  @Column('boolean', { default: true })
  isActive: boolean;
}
