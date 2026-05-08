import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('banks')
export class Bank {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('text', { unique: true })
  code: string;

  @Column('text')
  name: string;

  @Column('boolean', { default: true })
  isActive: boolean;
}
