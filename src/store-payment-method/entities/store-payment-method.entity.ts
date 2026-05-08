import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Store } from 'src/store/entities/store.entity';
import { Bank } from 'src/bank/entities/bank.entity';
import { PaymentMethodType } from '../types';

@Entity('store_payment_methods')
export class StorePaymentMethod {
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

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => Store, (store) => store.paymentMethodConfigs, { onDelete: 'CASCADE' })
  store: Store;

  @ManyToOne(() => Bank, { nullable: true, eager: true })
  bank?: Bank | null;
}
