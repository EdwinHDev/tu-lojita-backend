import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Unique,
} from 'typeorm';
import { TimestampEntity } from 'src/common/entities/timestamp.entity';
import { Store } from './store.entity';
import { User } from 'src/user/entities/user.entity';

@Entity('store_customer_blocks')
@Unique(['storeId', 'customerId'])
export class StoreCustomerBlock extends TimestampEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Store, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'storeId' })
  store: Store;

  @Column()
  storeId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'customerId' })
  customer: User;

  @Column()
  customerId: string;

  @Column('text')
  reason: string;
}
