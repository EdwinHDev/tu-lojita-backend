import {
  Column,
  Entity,
  ManyToOne,
  JoinColumn,
  PrimaryGeneratedColumn,
  Index,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { Order } from 'src/order/entities/order.entity';
import { User } from 'src/user/entities/user.entity';

@Entity('order_reviews')
export class OrderReview {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Una sola reseña por orden. Constraint UNIQUE garantizado en BD. */
  @Index({ unique: true })
  @Column('uuid')
  orderId: string;

  @ManyToOne(() => Order, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'orderId' })
  order: Order;

  /** El cliente autor de la reseña */
  @Column('uuid')
  authorId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'authorId' })
  author: User;

  /** Calificación global de 1 a 5 */
  @Column('int')
  rating: number;

  @Column('text', { nullable: true })
  comment?: string | null;

  /** URLs de imágenes adjuntas (hasta 5) */
  @Column({ type: 'text', array: true, default: [] })
  imageUrls: string[];

  /** Respuesta única del vendedor a esta reseña */
  @Column('text', { nullable: true })
  vendorReply?: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  vendorRepliedAt?: Date | null;

  /** Control de moderación del admin */
  @Column('boolean', { default: true })
  isVisible: boolean;

  /** Contador de 'Me Gusta' (Likes) */
  @Column('int', { default: 0 })
  likesCount: number;

  @OneToMany('OrderReviewLike', 'review')
  likes: any[];

  /** Campo dinámico/virtual para indicar si el usuario actual dio like */
  isLikedByMe?: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
