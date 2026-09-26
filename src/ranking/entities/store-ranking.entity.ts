import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { TimestampEntity } from 'src/common/entities/timestamp.entity';
import { Store } from 'src/store/entities/store.entity';
import { Division } from '../types/division.enum';

@Entity('store_rankings')
export class StoreRanking extends TimestampEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column('uuid')
  storeId: string;

  @OneToOne(() => Store, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'storeId' })
  store: Store;

  @Index()
  @Column('int', { default: 0 })
  currentLP: number; // Represents PR (Puntos de Rango)

  @Column('enum', {
    enum: Division,
    default: Division.PUESTO_AMBULANTE,
  })
  division: Division;

  @Column('boolean', { default: true })
  isCalibrating: boolean;

  @Column('int', { default: 0 })
  calibrationOrdersCompleted: number;

  @Column('boolean', { default: false })
  isFlagged: boolean;

  @Column('timestamptz', { nullable: true })
  lastActivityDate?: Date;

  // Escudo de Rango (48h grace period upon promotion)
  @Column('timestamptz', { nullable: true })
  rankShieldExpiresAt?: Date;

  // Zona de Peligro (pulsating warning when at 0 PR before demotion)
  @Column('boolean', { default: false })
  inDangerZone: boolean;

  @Column('timestamptz', { nullable: true })
  dangerZoneExpiresAt?: Date;

  // Daily Sales Streak ("Comercio en Llamas")
  @Column('int', { default: 0 })
  consecutiveSalesDays: number;

  @Column('timestamptz', { nullable: true })
  lastSaleDate?: Date;

  // Daily Merchant Missions tracking
  @Column('int', { default: 0 })
  dailyMissionsCompletedToday: number;

  @Column('timestamptz', { nullable: true })
  lastMissionDate?: Date;

  @Column('simple-json', { nullable: true })
  claimedMissionsToday?: string[];
}
