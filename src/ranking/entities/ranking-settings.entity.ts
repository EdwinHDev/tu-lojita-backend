import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';
import { TimestampEntity } from 'src/common/entities/timestamp.entity';
import {
  LpValuesConfig,
  DivisionThresholdsConfig,
  CalibrationConfig,
  AntiCheatConfig,
  InactivityConfig,
  MaestroConfig,
  DivisionEmblemsConfig,
  DivisionFramesConfig,
  RetentionConfig,
  MissionsConfig,
} from '../types/ranking-settings.interface';

@Entity('ranking_settings')
export class RankingSettings extends TimestampEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('jsonb')
  lpValues: LpValuesConfig;

  @Column('jsonb')
  divisionThresholds: DivisionThresholdsConfig;

  @Column('jsonb')
  calibration: CalibrationConfig;

  @Column('jsonb')
  antiCheat: AntiCheatConfig;

  @Column('jsonb')
  inactivity: InactivityConfig;

  @Column('jsonb')
  maestro: MaestroConfig;

  @Column('jsonb')
  divisionEmblems: DivisionEmblemsConfig;

  @Column('jsonb', { nullable: true })
  divisionFrames?: DivisionFramesConfig;

  @Column('jsonb', { nullable: true })
  retention: RetentionConfig;

  @Column('jsonb', { nullable: true })
  missions: MissionsConfig;
}
