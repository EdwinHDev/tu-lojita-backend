import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { Store } from 'src/store/entities/store.entity';
import { RankingEventType } from '../types/ranking-event-type.enum';

@Entity('ranking_events')
export class RankingEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column('uuid')
  storeId: string;

  @ManyToOne(() => Store, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'storeId' })
  store: Store;

  @Index()
  @Column('enum', {
    enum: RankingEventType,
  })
  eventType: RankingEventType;

  @Column('int')
  prDelta: number;

  get lpDelta(): number {
    return this.prDelta;
  }
  set lpDelta(value: number) {
    this.prDelta = value;
  }

  @Column('text', { nullable: true })
  referenceId?: string;

  @Index()
  @Column('uuid', { nullable: true })
  buyerAccountId?: string;

  @Column('boolean', { default: false })
  isVoided: boolean;

  @Column('boolean', { default: false })
  antiCheatBlocked: boolean;

  @Column('jsonb', { nullable: true })
  metadata?: Record<string, any>;

  @Index()
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
