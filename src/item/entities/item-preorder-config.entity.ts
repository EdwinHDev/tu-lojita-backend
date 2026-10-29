import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { TimestampEntity } from '../../common/entities/timestamp.entity';
import { Item } from './item.entity';
import { DepositType } from '../types/deposit-type.enum';

@Entity('item_preorder_configs')
export class ItemPreorderConfig extends TimestampEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'enum',
    enum: DepositType,
    default: DepositType.FULL_PAYMENT,
  })
  depositType: DepositType;

  @Column('numeric', {
    default: 0,
    transformer: {
      to: (value: number) => value,
      from: (value: string) =>
        value !== null && value !== undefined ? parseFloat(value) : 0,
    },
  })
  depositValue: number;

  @Column('int', { default: 7 })
  estimatedLeadDaysMin: number;

  @Column('int', { default: 15 })
  estimatedLeadDaysMax: number;

  @Column('int', { default: 50 })
  maxPreOrderUnits: number;

  @Column('int', { default: 0 })
  reservedPreOrderUnits: number;

  @Column('int', { default: 48 })
  settlementWindowHours: number;

  @OneToOne(() => Item, (item) => item.preorderConfig, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'itemId' })
  item: Item;

  @Column('uuid')
  itemId: string;
}
