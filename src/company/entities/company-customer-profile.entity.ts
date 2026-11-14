import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { TimestampEntity } from 'src/common/entities/timestamp.entity';
import { Company } from './company.entity';
import { User } from 'src/user/entities/user.entity';

@Entity('company_customer_profiles')
@Unique(['companyId', 'customerId'])
export class CompanyCustomerProfile extends TimestampEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  companyId: string;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'companyId' })
  company: Company;

  @Column('uuid')
  customerId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'customerId' })
  customer: User;

  @Column({ type: 'text', array: true, default: [] })
  tags: string[];

  @Column({ type: 'text', default: 'WHATSAPP' })
  preferredChannel: string;

  @Column({ type: 'timestamptz', nullable: true })
  lastContactAt?: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  nextFollowUpAt?: Date | null;

  @Column({ type: 'text', nullable: true })
  nextFollowUpNote?: string | null;

  @Column({ type: 'boolean', default: false })
  isFollowUpCompleted: boolean;
}
