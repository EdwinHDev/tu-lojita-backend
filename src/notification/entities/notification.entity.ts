import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
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
}

@Entity('notifications')
export class Notification {
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

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => User, (user) => user.notifications, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  userId: string;
}
