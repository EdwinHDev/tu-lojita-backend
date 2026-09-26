import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Unique,
  Index,
} from 'typeorm';
import { Store } from 'src/store/entities/store.entity';
import { AchievementDefinition } from './achievement-definition.entity';

@Entity('store_achievement_unlocks')
@Unique(['storeId', 'achievementId'])
export class StoreAchievementUnlock {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column('uuid')
  storeId: string;

  @ManyToOne(() => Store, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'storeId' })
  store: Store;

  @Index()
  @Column('uuid')
  achievementId: string;

  @ManyToOne(() => AchievementDefinition, (a) => a.unlocks, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'achievementId' })
  achievement: AchievementDefinition;

  @CreateDateColumn({ type: 'timestamptz' })
  unlockedAt: Date;

  @Column('int', { default: 0 })
  lpBonusGranted: number;
}
