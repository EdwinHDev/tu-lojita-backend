import {
  Column,
  Entity,
  ManyToOne,
  JoinColumn,
  PrimaryGeneratedColumn,
  Index,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Order } from 'src/order/entities/order.entity';
import { User } from 'src/user/entities/user.entity';

@Entity('buyer_reviews')
export class BuyerReview {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Una sola calificación de comprador por orden. */
  @Index({ unique: true })
  @Column('uuid')
  orderId: string;

  @ManyToOne(() => Order, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'orderId' })
  order: Order;

  /** El vendedor/dueño de la tienda que califica */
  @Column('uuid')
  authorId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'authorId' })
  author: User;

  /** El comprador calificado */
  @Column('uuid')
  targetUserId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'targetUserId' })
  targetUser: User;

  /** Calificación de 1 a 5 */
  @Column('int')
  rating: number;

  @Column('text', { nullable: true })
  comment?: string | null;

  /** Control de moderación del admin */
  @Column('boolean', { default: true })
  isVisible: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
