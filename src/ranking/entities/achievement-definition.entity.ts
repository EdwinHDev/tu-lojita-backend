import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { TimestampEntity } from 'src/common/entities/timestamp.entity';
import { AchievementCategory } from '../types/achievement-category.enum';
import { AchievementTriggerType } from '../types/achievement-trigger-type.enum';
import { StoreAchievementUnlock } from './store-achievement-unlock.entity';

@Entity('achievement_definitions')
export class AchievementDefinition extends TimestampEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('text')
  name: string;

  @Column('text')
  description: string;

  @Column('text')
  imageUrl: string;

  @Column('int', { default: 0 })
  lpBonus: number;

  @Column('enum', {
    enum: AchievementCategory,
    default: AchievementCategory.MILESTONES,
  })
  category: AchievementCategory;

  @Column('enum', {
    enum: AchievementTriggerType,
  })
  triggerType: AchievementTriggerType;

  @Column('numeric', { default: 1 })
  triggerThreshold: number;

  @Column('boolean', { default: true })
  isActive: boolean;

  @OneToMany(() => StoreAchievementUnlock, (u) => u.achievement)
  unlocks: StoreAchievementUnlock[];
}
