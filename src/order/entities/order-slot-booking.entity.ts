import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { TimestampEntity } from '../../common/entities/timestamp.entity';
import { Order } from './order.entity';
import { ItemTimeSlot } from '../../item/entities/item-time-slot.entity';
import { User } from '../../user/entities/user.entity';
import { Store } from '../../store/entities/store.entity';
import { SlotBookingStatus } from '../types/slot-booking-status.enum';

@Entity('order_slot_bookings')
export class OrderSlotBooking extends TimestampEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('varchar', { length: 10 })
  bookingDate: string; // YYYY-MM-DD

  @Column('varchar', { length: 5 })
  slotStartTime: string; // HH:mm

  @Column('varchar', { length: 5 })
  slotEndTime: string; // HH:mm

  @Column('varchar', { length: 100 })
  slotLabel: string;

  @Column({ type: 'timestamptz', nullable: true })
  lockedUntil?: Date | null;

  @Column({
    type: 'enum',
    enum: SlotBookingStatus,
    default: SlotBookingStatus.HOLD,
  })
  status: SlotBookingStatus;

  @ManyToOne(() => Order, (order) => order.slotBookings, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'orderId' })
  order?: Order | null;

  @Column('uuid', { nullable: true })
  orderId?: string | null;

  @ManyToOne(() => ItemTimeSlot, (slot) => slot.orderBookings, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'timeSlotId' })
  timeSlot: ItemTimeSlot;

  @Column('uuid')
  timeSlotId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'customerId' })
  customer: User;

  @Column('uuid')
  customerId: string;

  @ManyToOne(() => Store, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'storeId' })
  store: Store;

  @Column('uuid')
  storeId: string;
}
