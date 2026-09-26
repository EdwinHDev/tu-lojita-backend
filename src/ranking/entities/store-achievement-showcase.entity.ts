import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Unique,
  Index,
} from 'typeorm';
import { Store } from 'src/store/entities/store.entity';
import { AchievementDefinition } from './achievement-definition.entity';

@Entity('store_achievement_showcases')
@Unique(['storeId', 'position'])
export class StoreAchievementShowcase {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column('uuid')
  storeId: string;

  @ManyToOne(() => Store, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'storeId' })
  store: Store;

  @Column('uuid')
  achievementId: string;

  @ManyToOne(() => AchievementDefinition, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'achievementId' })
  achievement: AchievementDefinition;

  @Column('int')
  position: number;
}
