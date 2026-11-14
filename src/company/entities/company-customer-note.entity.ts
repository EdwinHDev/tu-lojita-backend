import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { TimestampEntity } from 'src/common/entities/timestamp.entity';
import { Company } from './company.entity';
import { User } from 'src/user/entities/user.entity';

@Entity('company_customer_notes')
export class CompanyCustomerNote extends TimestampEntity {
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

  @Column({ type: 'uuid', nullable: true })
  authorId?: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'authorId' })
  author?: User | null;

  @Column('text')
  authorName: string;

  @Column('text')
  content: string;

  @Column({ type: 'text', default: 'GENERAL' })
  category: string;
}
