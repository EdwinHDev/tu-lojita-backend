import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { TimestampEntity } from 'src/common/entities/timestamp.entity';
import { Order } from 'src/order/entities/order.entity';
import { User } from 'src/user/entities/user.entity';
import { DisputeType, DisputeStatus, DisputeResolution } from '../types';

@Entity({ name: 'order_disputes' })
export class OrderDispute extends TimestampEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  orderId: string;

  @ManyToOne(() => Order, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'orderId' })
  order: Order;

  @Column('uuid')
  requestedById: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'requestedById' })
  requestedBy: User;

  @Column({
    type: 'enum',
    enum: DisputeType,
    default: DisputeType.OTHER,
  })
  type: DisputeType;

  @Column({
    type: 'enum',
    enum: DisputeStatus,
    default: DisputeStatus.OPEN,
  })
  status: DisputeStatus;

  @Column('text')
  description: string;

  @Column({ type: 'text', array: true, default: [] })
  evidenceUrls: string[];

  @Column('text', { nullable: true })
  merchantResponse?: string;

  @Column({ type: 'text', array: true, default: [] })
  merchantEvidenceUrls: string[];

  @Column('text', { nullable: true })
  adminNote?: string;

  @Column({
    type: 'enum',
    enum: DisputeResolution,
    nullable: true,
  })
  resolution?: DisputeResolution;

  @Column('timestamp with time zone', { nullable: true })
  resolvedAt?: Date | null;

  @Column({ type: 'boolean', default: false })
  merchantMarkedResolved: boolean = false;

  @Column({ type: 'boolean', default: false })
  clientMarkedResolved: boolean = false;

  @Column('timestamp with time zone', { nullable: true })
  merchantMarkedResolvedAt?: Date | null;

  @Column('timestamp with time zone', { nullable: true })
  clientMarkedResolvedAt?: Date | null;
}
