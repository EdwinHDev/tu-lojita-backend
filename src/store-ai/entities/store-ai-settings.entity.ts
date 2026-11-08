import {
  Column,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryColumn,
} from 'typeorm';
import { TimestampEntity } from 'src/common/entities/timestamp.entity';
import { Store } from 'src/store/entities/store.entity';

export interface StoreSavedPrompt {
  id: string;
  title: string;
  prompt: string;
}

@Entity('store_ai_settings')
export class StoreAiSettings extends TimestampEntity {
  @PrimaryColumn('uuid')
  storeId: string;

  @OneToOne(() => Store, (store) => store.aiSettings, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'storeId' })
  store: Store;

  @Column('boolean', { default: false })
  isEnabled: boolean;

  @Column({ type: 'text', nullable: true, select: false })
  encryptedApiKey?: string | null;

  @Column('varchar', { length: 32, nullable: true })
  apiKeyHint?: string | null;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  customPrompts: StoreSavedPrompt[];

  @Column('int', { default: 50 })
  dailyLimit: number;

  @Column('int', { default: 0 })
  usageCountToday: number;

  @Column('varchar', { length: 10, nullable: true })
  usageDate?: string | null;
}
