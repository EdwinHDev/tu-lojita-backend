import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { TimestampEntity } from 'src/common/entities/timestamp.entity';
import { PlatformPaymentType } from '../types';

@Entity('platform_payment_methods')
export class PlatformPaymentMethod extends TimestampEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'enum',
    enum: PlatformPaymentType,
  })
  type: PlatformPaymentType;

  @Column('text')
  title: string;

  @Column('jsonb')
  accountDetails: Record<string, any>;

  @Column('text', { nullable: true })
  qrImageUrl?: string | null;

  @Column('text', { nullable: true })
  instructions?: string | null;

  @Column('boolean', { default: true })
  isActive: boolean;
}
