import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { TimestampEntity } from 'src/common/entities/timestamp.entity';
import { Store } from './store.entity';
import { User } from 'src/user/entities/user.entity';

export enum MediationTopic {
  SETTLE_DEBT = 'SETTLE_DEBT',
  CLARIFY_MISUNDERSTANDING = 'CLARIFY_MISUNDERSTANDING',
  ACCOUNT_REACTIVATION = 'ACCOUNT_REACTIVATION',
  OTHER = 'OTHER',
}

export enum MediationStatus {
  PENDING = 'PENDING',
  ACCEPTED = 'ACCEPTED',
  REJECTED = 'REJECTED',
}

@Entity('mediation_requests')
export class MediationRequest extends TimestampEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Store, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'storeId' })
  store: Store;

  @Column()
  storeId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'customerId' })
  customer: User;

  @Column()
  customerId: string;

  @Column({
    type: 'enum',
    enum: MediationTopic,
    default: MediationTopic.ACCOUNT_REACTIVATION,
  })
  topic: MediationTopic;

  @Column('text')
  message: string;

  @Column('text', { nullable: true })
  attachmentUrl?: string;

  @Column({
    type: 'enum',
    enum: MediationStatus,
    default: MediationStatus.PENDING,
  })
  status: MediationStatus;

  @Column('text', { nullable: true })
  storeResponse?: string;
}
