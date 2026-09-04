import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { TimestampEntity } from 'src/common/entities/timestamp.entity';

@Entity('financial_otps')
export class FinancialOtp extends TimestampEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('text')
  email: string;

  @Column('text')
  codeHash: string;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column('boolean', { default: false })
  isUsed: boolean;

  @Column('text', { nullable: true })
  accessToken?: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  tokenExpiresAt?: Date | null;
}
