import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { TimestampEntity } from 'src/common/entities/timestamp.entity';
import { Company } from './company.entity';
import { Store } from 'src/store/entities/store.entity';
import { User } from 'src/user/entities/user.entity';
import { Item } from 'src/item/entities/item.entity';

export enum CrmOfferStatus {
  ACTIVE = 'ACTIVE',
  EXPIRED = 'EXPIRED',
  CANCELLED = 'CANCELLED',
  REDEEMED = 'REDEEMED',
}

const decimalTransformer = {
  to: (value: number) => value,
  from: (value: string | number | null | undefined) =>
    value !== null && value !== undefined ? parseFloat(String(value)) : 0,
};

@Entity('crm_targeted_offers')
export class CrmTargetedOffer extends TimestampEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  companyId: string;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'companyId' })
  company: Company;

  @Column('uuid')
  storeId: string;

  @ManyToOne(() => Store, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'storeId' })
  store: Store;

  @Column('uuid')
  customerId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'customerId' })
  customer: User;

  @Column('uuid')
  itemId: string;

  @ManyToOne(() => Item, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'itemId' })
  item: Item;

  @Column({ type: 'uuid', nullable: true })
  createdByUserId?: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'createdByUserId' })
  createdByUser?: User | null;

  @Column({ type: 'text', unique: true })
  offerCode: string;

  @Column('decimal', {
    precision: 12,
    scale: 2,
    transformer: decimalTransformer,
  })
  originalPrice: number;

  @Column('decimal', {
    precision: 12,
    scale: 2,
    transformer: decimalTransformer,
  })
  offerPrice: number;

  @Column('decimal', {
    precision: 5,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
  })
  discountPercent: number;

  @Column('int')
  durationHours: number;

  @Column('timestamptz')
  expiresAt: Date;

  @Column({
    type: 'enum',
    enum: CrmOfferStatus,
    default: CrmOfferStatus.ACTIVE,
  })
  status: CrmOfferStatus;

  @Column('decimal', {
    precision: 10,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
  })
  serviceFeeUsd: number;

  @Column({ type: 'text', nullable: true })
  paymentMethod?: string | null;

  @Column({ type: 'text', nullable: true })
  paymentReference?: string | null;

  @Column('text')
  deepLinkUrl: string;

  @Column('text')
  whatsappShareText: string;

  @Column({ type: 'text', nullable: true })
  messageToCustomer?: string | null;
}
