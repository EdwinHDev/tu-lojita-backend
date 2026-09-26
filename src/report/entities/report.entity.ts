import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { TimestampEntity } from 'src/common/entities/timestamp.entity';
import { User } from 'src/user/entities/user.entity';
import { Store } from 'src/store/entities/store.entity';
import { Item } from 'src/item/entities/item.entity';
import { ChatMessage } from 'src/notification/entities/chat-message.entity';

export enum ReportType {
  STORE = 'STORE',
  ITEM = 'ITEM',
  CHAT_MESSAGE = 'CHAT_MESSAGE',
  USER = 'USER',
}

export enum ReportCategory {
  FRAUD_SCAM = 'FRAUD_SCAM',
  PROHIBITED_GOODS = 'PROHIBITED_GOODS',
  OFFENSIVE_CONTENT = 'OFFENSIVE_CONTENT',
  HARASSMENT = 'HARASSMENT',
  INTELLECTUAL_PROPERTY = 'INTELLECTUAL_PROPERTY',
  UNDERAGE_VIOLATION = 'UNDERAGE_VIOLATION',
  OTHER = 'OTHER',
}

export enum ReportStatus {
  PENDING = 'PENDING',
  INVESTIGATING = 'INVESTIGATING',
  RESOLVED = 'RESOLVED',
  DISMISSED = 'DISMISSED',
}

export enum ReportAction {
  NONE = 'NONE',
  STRIKE_ISSUED = 'STRIKE_ISSUED',
  STORE_SUSPENDED = 'STORE_SUSPENDED',
  ITEM_HIDDEN = 'ITEM_HIDDEN',
  CHAT_PENALTY_APPLIED = 'CHAT_PENALTY_APPLIED',
  DISMISSED = 'DISMISSED',
}

@Entity('reports')
export class Report extends TimestampEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'reporterId' })
  reporter: User;

  @Column()
  reporterId: string;

  @Column({
    type: 'enum',
    enum: ReportType,
  })
  type: ReportType;

  @Column({
    type: 'enum',
    enum: ReportCategory,
    default: ReportCategory.OTHER,
  })
  category: ReportCategory;

  @Column('text')
  reason: string;

  @Column('text', { nullable: true })
  evidenceUrl?: string;

  @ManyToOne(() => Store, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'targetStoreId' })
  targetStore?: Store;

  @Column({ nullable: true })
  targetStoreId?: string;

  @ManyToOne(() => Item, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'targetItemId' })
  targetItem?: Item;

  @Column({ nullable: true })
  targetItemId?: string;

  @ManyToOne(() => ChatMessage, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'targetChatMessageId' })
  targetChatMessage?: ChatMessage;

  @Column({ nullable: true })
  targetChatMessageId?: string;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'targetUserId' })
  targetUser?: User;

  @Column({ nullable: true })
  targetUserId?: string;

  @Column({
    type: 'enum',
    enum: ReportStatus,
    default: ReportStatus.PENDING,
  })
  status: ReportStatus;

  @Column({
    type: 'enum',
    enum: ReportAction,
    default: ReportAction.NONE,
  })
  actionTaken: ReportAction;

  @Column('text', { nullable: true })
  adminNotes?: string;

  @Column({
    type: 'text',
    array: true,
    default: [],
  })
  evidenceMessages?: string[];

  @Column({ type: 'timestamp with time zone', nullable: true })
  resolvedAt?: Date;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'resolvedById' })
  resolvedBy?: User;

  @Column({ nullable: true })
  resolvedById?: string;
}
