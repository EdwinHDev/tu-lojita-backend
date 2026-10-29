import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { TimestampEntity } from 'src/common/entities/timestamp.entity';
import { User } from './user.entity';
import { UserSuspension } from './user-suspension.entity';

export enum AppealStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  MORE_INFO_REQUESTED = 'MORE_INFO_REQUESTED',
}

@Entity('suspension_appeals')
export class SuspensionAppeal extends TimestampEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => UserSuspension, (suspension) => suspension.appeals, {
    onDelete: 'CASCADE',
    nullable: true,
  })
  @JoinColumn({ name: 'suspensionId' })
  suspension?: UserSuspension | null;

  @Column('uuid', { nullable: true })
  suspensionId?: string | null;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column('uuid')
  userId: string;

  @Column('text')
  reason: string;

  @Column('text', { array: true, default: '{}' })
  evidenceUrls: string[];

  @Column('text', { nullable: true })
  contactPhone?: string | null;

  @Column({
    type: 'enum',
    enum: AppealStatus,
    default: AppealStatus.PENDING,
  })
  status: AppealStatus;

  @Column('text', { nullable: true })
  adminNotes?: string | null;

  @Column('text', { nullable: true })
  requestedInfo?: string | null;

  @Column('text', { nullable: true })
  additionalInfo?: string | null;

  @Column('text', { array: true, default: '{}' })
  additionalEvidenceUrls: string[];

  @Column({ type: 'boolean', default: false })
  allowReappeal: boolean;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'reviewedById' })
  reviewedBy?: User | null;

  @Column({ nullable: true })
  reviewedById?: string | null;

  @Column({ type: 'timestamp with time zone', nullable: true })
  reviewedAt?: Date | null;
}
