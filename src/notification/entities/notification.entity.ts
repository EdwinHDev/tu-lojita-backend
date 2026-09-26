import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { TimestampEntity } from 'src/common/entities/timestamp.entity';
import { User } from '../../user/entities/user.entity';

export enum NotificationType {
  ORDER_CREATED = 'ORDER_CREATED',
  ORDER_APPROVED = 'ORDER_APPROVED',
  ORDER_REJECTED = 'ORDER_REJECTED',
  PAYMENT_REPORTED = 'PAYMENT_REPORTED',
  PAYMENT_APPROVED = 'PAYMENT_APPROVED',
  PAYMENT_REJECTED = 'PAYMENT_REJECTED',
  PROMO = 'PROMO',
  GENERAL = 'GENERAL',
  CHAT_MESSAGE = 'CHAT_MESSAGE',
  STRIKE_APPLIED = 'STRIKE_APPLIED',
  REPORT_RESOLUTION = 'REPORT_RESOLUTION',
  MEDIATION_REQUEST = 'MEDIATION_REQUEST',
  MEDIATION_RESPONSE = 'MEDIATION_RESPONSE',
  CUSTOMER_BLOCKED = 'CUSTOMER_BLOCKED',
  CUSTOMER_UNBLOCKED = 'CUSTOMER_UNBLOCKED',
  STORE_SUSPENDED = 'STORE_SUSPENDED',
  ITEM_HIDDEN = 'ITEM_HIDDEN',
  // Review system
  ORDER_REVIEW_PROMPT = 'ORDER_REVIEW_PROMPT',
  BUYER_REVIEW_PROMPT = 'BUYER_REVIEW_PROMPT',
  ORDER_REVIEW_RECEIVED = 'ORDER_REVIEW_RECEIVED',
  ORDER_REVIEW_REPLIED = 'ORDER_REVIEW_REPLIED',
  BUYER_REVIEW_RECEIVED = 'BUYER_REVIEW_RECEIVED',
  // Ranking & Achievements
  DIVISION_UP = 'DIVISION_UP',
  DIVISION_DOWN = 'DIVISION_DOWN',
  ACHIEVEMENT_UNLOCKED = 'ACHIEVEMENT_UNLOCKED',
  STORE_FLAGGED = 'STORE_FLAGGED',
  WEEKLY_RANKING_SUMMARY = 'WEEKLY_RANKING_SUMMARY',
  STREAK_EXPIRING = 'STREAK_EXPIRING',
  CATEGORY_RIVALRY = 'CATEGORY_RIVALRY',
  RANK_SHIELD_EXPIRING = 'RANK_SHIELD_EXPIRING',
  DANGER_ZONE_ALERT = 'DANGER_ZONE_ALERT',
}

@Entity('notifications')
export class Notification extends TimestampEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  title: string;

  @Column('text')
  body: string;

  @Column({
    type: 'enum',
    enum: NotificationType,
    default: NotificationType.GENERAL,
  })
  type: NotificationType;

  @Column({ nullable: true })
  targetId: string; // e.g. orderId

  @Column({ default: false })
  isRead: boolean;

  @ManyToOne(() => User, (user) => user.notifications, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  userId: string;
}
