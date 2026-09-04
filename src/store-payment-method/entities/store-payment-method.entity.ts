import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { TimestampEntity } from 'src/common/entities/timestamp.entity';
import { Store } from 'src/store/entities/store.entity';
import { Bank } from 'src/bank/entities/bank.entity';
import { PaymentMethodType } from '../types';

@Entity('store_payment_methods')
export class StorePaymentMethod extends TimestampEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'enum',
    enum: PaymentMethodType,
  })
  type: PaymentMethodType;

  @Column('text')
  title: string;

  @Column('text', { nullable: true })
  accountHolder: string;

  @Column('text', { nullable: true })
  idNumber: string;

  @Column('text', { nullable: true })
  accountNumber: string;

  @Column('text', { nullable: true })
  phoneNumber: string;

  @Column('text', { nullable: true })
  email: string;

  @Column('text', { nullable: true })
  walletAddress: string;

  @Column('text', { nullable: true })
  instructions: string;

  @Column('boolean', { default: true })
  isActive: boolean;

  @ManyToOne(() => Store, (store) => store.paymentMethodConfigs, {
    onDelete: 'CASCADE',
  })
  store: Store;

  @ManyToOne(() => Bank, { nullable: true, eager: true })
  bank?: Bank | null;
}
