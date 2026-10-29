import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  ManyToMany,
  JoinTable,
  BeforeInsert,
  BeforeUpdate,
  Index,
} from 'typeorm';
import * as bcrypt from 'bcrypt';
import { TimestampEntity } from 'src/common/entities/timestamp.entity';
import { Company } from './company.entity';
import { CompanyRole } from './company-role.entity';
import { Store } from 'src/store/entities/store.entity';

@Entity('company_collaborators')
export class CompanyCollaborator extends TimestampEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @Index('IDX_company_collaborators_companyId')
  company: Company;

  @ManyToOne(() => CompanyRole, (role) => role.collaborators, {
    onDelete: 'RESTRICT',
    eager: true,
  })
  @Index('IDX_company_collaborators_roleId')
  role: CompanyRole;

  @Column('varchar', { length: 8, unique: true })
  @Index('IDX_company_collaborators_accessId')
  accessId: string;

  @Column({ type: 'text', select: false })
  password: string;

  @Column('text')
  firstName: string;

  @Column('text')
  lastName: string;

  @Column('text', { nullable: true })
  identification?: string;

  @Column('text', { nullable: true })
  phone?: string;

  @Column('boolean', { default: true })
  isActive: boolean;

  @Column('boolean', { default: false })
  hasFullBranchAccess: boolean;

  @Column('int', { default: 1 })
  tokenVersion: number;

  @ManyToMany(() => Store, { eager: true, cascade: true })
  @JoinTable({
    name: 'collaborator_branches',
    joinColumn: { name: 'collaboratorId', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'storeId', referencedColumnName: 'id' },
  })
  stores: Store[];

  @BeforeInsert()
  @BeforeUpdate()
  hashPassword() {
    if (this.password && !this.password.startsWith('$2b$')) {
      this.password = bcrypt.hashSync(this.password, 10);
    }
  }

  get fullName(): string {
    return `${this.firstName} ${this.lastName}`.trim();
  }
}
