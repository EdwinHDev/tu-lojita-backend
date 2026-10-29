import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { Company } from './company.entity';
import { Store } from 'src/store/entities/store.entity';

export enum ActivityLogModule {
  INVENTORY = 'INVENTORY',
  ORDERS = 'ORDERS',
  INSTALLMENTS = 'INSTALLMENTS',
  DISPUTES = 'DISPUTES',
  TEAM = 'TEAM',
  COLLABORATORS = 'TEAM',
  STORE = 'STORE',
}

export enum ActivityLogActorType {
  OWNER = 'OWNER',
  COLLABORATOR = 'COLLABORATOR',
}

@Entity('company_activity_logs')
@Index('IDX_company_activity_logs_company_created', ['company', 'createdAt'])
@Index('IDX_company_activity_logs_store_created', ['store', 'createdAt'])
export class CompanyActivityLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @Index('IDX_company_activity_logs_companyId')
  company: Company;

  @Column({ name: 'companyId', type: 'uuid' })
  companyId: string;

  @ManyToOne(() => Store, { nullable: true, onDelete: 'SET NULL' })
  @Index('IDX_company_activity_logs_storeId')
  store?: Store;

  @Column({ name: 'storeId', type: 'uuid', nullable: true })
  storeId?: string;

  @Column('varchar', { length: 20 })
  actorType: 'OWNER' | 'COLLABORATOR';

  @Column('uuid')
  @Index('IDX_company_activity_logs_actor')
  actorId: string;

  @Column('text')
  actorName: string;

  @Column('text')
  actorRoleName: string;

  @Column('varchar', { length: 30 })
  @Index('IDX_company_activity_logs_module')
  module: ActivityLogModule | string;

  @Column('varchar', { length: 50 })
  action: string;

  @Column('text')
  description: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any>;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
