import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { TimestampEntity } from '../../common/entities/timestamp.entity';
import { Item } from './item.entity';
import { ItemTimeSlot } from './item-time-slot.entity';
import { ServiceLocationType } from '../types/service-location-type.enum';

@Entity('item_slot_configs')
export class ItemSlotConfig extends TimestampEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('numeric', {
    default: 2,
    transformer: {
      to: (value: number) => value,
      from: (value: string) =>
        value !== null && value !== undefined ? parseFloat(value) : 2,
    },
  })
  minNoticeHours: number;

  @Column('int', { default: 60 })
  serviceDurationMinutes: number;

  @Column('boolean', { default: true })
  allowSameDay: boolean;

  @Column('int', { default: 1 })
  maxConcurrentBookings: number;

  @Column('varchar', {
    length: 30,
    default: ServiceLocationType.ON_SITE,
  })
  serviceLocationType: ServiceLocationType;

  @OneToOne(() => Item, (item) => item.slotConfig, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'itemId' })
  item: Item;

  @Column('uuid')
  itemId: string;

  @OneToMany(() => ItemTimeSlot, (slot) => slot.slotConfig, { cascade: true })
  slots: ItemTimeSlot[];
}
