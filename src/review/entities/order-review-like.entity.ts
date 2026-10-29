import {
  Column,
  Entity,
  ManyToOne,
  JoinColumn,
  PrimaryGeneratedColumn,
  Index,
  CreateDateColumn,
} from 'typeorm';
import { OrderReview } from './order-review.entity';
import { User } from 'src/user/entities/user.entity';

@Entity('order_review_likes')
@Index(['reviewId', 'userId'], { unique: true })
export class OrderReviewLike {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  reviewId: string;

  @ManyToOne(() => OrderReview, (review) => review.likes, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'reviewId' })
  review: OrderReview;

  @Column('uuid')
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
