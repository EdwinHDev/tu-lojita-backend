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
