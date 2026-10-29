import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { TimestampEntity } from 'src/common/entities/timestamp.entity';
import { User } from './user.entity';
import { SuspensionAppeal } from './suspension-appeal.entity';

export enum SuspensionType {
  TEMPORARY = 'TEMPORARY',
  PERMANENT = 'PERMANENT',
}

export enum SuspensionCaseStatus {
  ACTIVE = 'ACTIVE',
  LIFTED = 'LIFTED',
  EXPIRED = 'EXPIRED',
}

@Entity('user_suspensions')
export class UserSuspension extends TimestampEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column('uuid')
  userId: string;

  @Column({
    type: 'enum',
    enum: SuspensionType,
    default: SuspensionType.TEMPORARY,
  })
  type: SuspensionType;

  @Column('text')
  reason: string;

  @Column({ type: 'timestamp with time zone', nullable: true })
  suspendedUntil?: Date | null;

  @Column({
    type: 'enum',
    enum: SuspensionCaseStatus,
    default: SuspensionCaseStatus.ACTIVE,
  })
  status: SuspensionCaseStatus;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'createdById' })
  createdBy?: User | null;

  @Column('uuid', { nullable: true })
  createdById?: string | null;

  @Column({ type: 'timestamp with time zone', nullable: true })
  liftedAt?: Date | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'liftedById' })
  liftedBy?: User | null;

  @Column('uuid', { nullable: true })
  liftedById?: string | null;

  @Column('text', { nullable: true })
  liftedReason?: string | null;

  @OneToMany(() => SuspensionAppeal, (appeal) => appeal.suspension)
  appeals: SuspensionAppeal[];
}
