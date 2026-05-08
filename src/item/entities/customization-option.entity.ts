import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { CustomizationGroup } from './customization-group.entity';

@Entity('customization_options')
export class CustomizationOption {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('text')
  name: string;

  @Column('decimal', {
    precision: 10,
    scale: 2,
    default: 0,
    transformer: {
      to: (value: number) => value,
      from: (value: string) => (value ? parseFloat(value) : 0),
    },
  })
  price: number;

  @ManyToOne(() => CustomizationGroup, (group) => group.options, {
    onDelete: 'CASCADE',
  })
  group: CustomizationGroup;
}
