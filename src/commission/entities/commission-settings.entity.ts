import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { TimestampEntity } from 'src/common/entities/timestamp.entity';
import { FineType } from '../types';

@Entity('commission_settings')
export class CommissionSettings extends TimestampEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('boolean', { default: false })
  isEnabled: boolean;

  @Column('int', { default: 3 })
  gracePeriodDays: number;

  @Column({
    type: 'enum',
    enum: FineType,
    default: FineType.PERCENTAGE,
  })
  fineType: FineType;

  @Column('decimal', { precision: 12, scale: 2, default: 10.0 })
  fineValue: number;

  @Column('int', { default: 1 }) // 1 = Lunes
  billingDayOfWeek: number;
}
