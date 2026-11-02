import {
  Column,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  JoinColumn,
} from 'typeorm';
import { TimestampEntity } from 'src/common/entities/timestamp.entity';
import { Item } from './item.entity';
import { Store } from 'src/store/entities/store.entity';
import { ItemPromotionStatus } from '../types/item-promotion-status.enum';

@Entity('item_promotions')
export class ItemPromotion extends TimestampEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Item, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'itemId' })
  item: Item;

  @Column('uuid')
  itemId: string;

  @ManyToOne(() => Store, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'storeId' })
  store: Store;

  @Column('uuid')
  storeId: string;

  @Column('int', { default: 1 })
  durationDays: number;

  @Column('numeric', {
    default: 0,
    transformer: {
      to: (value: number) => value,
      from: (value: string) => parseFloat(value),
    },
  })
  amountPaid: number;

  @Column('text', { default: '' })
  paymentReference: string;

  @Column('text', { default: '' })
  paymentProofUrl: string;

  @Column('enum', {
    enum: ItemPromotionStatus,
    default: ItemPromotionStatus.PENDING,
  })
  status: ItemPromotionStatus;

  @Column('timestamp with time zone', { nullable: true })
  startsAt: Date | null;

  @Column('timestamp with time zone', { nullable: true })
  expiresAt: Date | null;

  @Column('timestamp with time zone', { nullable: true })
  approvedAt: Date | null;

  @Column('text', { nullable: true })
  adminNote: string | null;
}

