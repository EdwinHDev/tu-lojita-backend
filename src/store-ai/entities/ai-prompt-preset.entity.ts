import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { TimestampEntity } from 'src/common/entities/timestamp.entity';

@Entity('ai_prompt_presets')
@Index('IDX_ai_prompt_presets_active_order', ['isActive', 'sortOrder'])
export class AiPromptPreset extends TimestampEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('varchar', { length: 80 })
  title: string;

  @Column('text')
  prompt: string;

  @Column('text', { nullable: true })
  description?: string | null;

  @Column('int', { default: 0 })
  sortOrder: number;

  @Column('boolean', { default: true })
  isActive: boolean;
}
