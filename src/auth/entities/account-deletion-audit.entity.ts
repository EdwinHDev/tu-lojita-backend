import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { TimestampEntity } from 'src/common/entities/timestamp.entity';

@Entity('account_deletion_audits')
export class AccountDeletionAudit extends TimestampEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  originalUserId: string;

  @Column('text')
  emailHash: string;

  @Column('text', { nullable: true })
  reason?: string;

  @Column('text', { nullable: true })
  ipAddress?: string;

  @Column('text', { nullable: true })
  userAgent?: string;
}

