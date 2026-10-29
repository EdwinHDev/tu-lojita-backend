import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { TimestampEntity } from '../../common/entities/timestamp.entity';
import { ItemSlotConfig } from './item-slot-config.entity';
import { OrderSlotBooking } from '../../order/entities/order-slot-booking.entity';

@Entity('item_time_slots')
export class ItemTimeSlot extends TimestampEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('int', { nullable: true })
  dayOfWeek?: number | null; // 1 = Lunes, 7 = Domingo

  @Column('varchar', { length: 10, nullable: true })
  specificDate?: string | null; // YYYY-MM-DD

  @Column('varchar', { length: 5 })
  startTime: string; // HH:mm (ej: "08:00")

  @Column('varchar', { length: 5 })
  endTime: string; // HH:mm (ej: "11:00")

  @Column('varchar', { length: 100 })
  label: string; // ej: "Turno Mañana"

  @Column('boolean', { default: true })
  isActive: boolean;

  @ManyToOne(() => ItemSlotConfig, (config) => config.slots, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'slotConfigId' })
  slotConfig: ItemSlotConfig;

  @Column('uuid')
  slotConfigId: string;

  @OneToMany(() => OrderSlotBooking, (booking) => booking.timeSlot)
  orderBookings: OrderSlotBooking[];
}
