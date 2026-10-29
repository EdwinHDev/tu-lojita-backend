import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { TimestampEntity } from 'src/common/entities/timestamp.entity';
import { User } from 'src/user/entities/user.entity';
import { Order } from 'src/order/entities/order.entity';

export enum ChatChannelType {
  DIRECT = 'DIRECT',
  DISPUTE_BUYER_SUPPORT = 'DISPUTE_BUYER_SUPPORT',
  DISPUTE_MERCHANT_SUPPORT = 'DISPUTE_MERCHANT_SUPPORT',
}

@Entity({ name: 'chat_messages' })
export class ChatMessage extends TimestampEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('text')
  content: string;

  @Column({
    type: 'varchar',
    length: 32,
    default: ChatChannelType.DIRECT,
  })
  channelType: ChatChannelType;

  @Column('boolean', { default: false })
  isRead: boolean;

  @Column('boolean', { default: false })
  isDelivered: boolean;

  @Column('text', { nullable: true })
  imageUrl?: string;

  @ManyToOne(() => User)
  sender: User;

  @ManyToOne(() => Order)
  order: Order;
}
