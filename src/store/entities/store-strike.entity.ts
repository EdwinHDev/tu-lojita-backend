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

@Entity('store_strikes')
export class StoreStrike extends TimestampEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Store, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'storeId' })
  store: Store;

  @Column()
  storeId: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'issuedById' })
  issuedBy: User;

  @Column({ nullable: true })
  issuedById: string;

  @Column('text')
  reason: string;

  @Column({ type: 'timestamp with time zone' })
  expiresAt: Date;

  @Column({ default: false })
  isRevoked: boolean;

  @Column('text', { nullable: true })
  revokedReason?: string;

  @Column({ type: 'timestamp with time zone', nullable: true })
  revokedAt?: Date;

  @Column({ nullable: true })
  reportId?: string;
}
