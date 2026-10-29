import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  Unique,
  Index,
} from 'typeorm';
import { TimestampEntity } from 'src/common/entities/timestamp.entity';
import { Company } from './company.entity';
import { CompanyRolePermission } from './company-role-permission.entity';
import { CompanyCollaborator } from './company-collaborator.entity';

@Entity('company_roles')
@Unique(['company', 'name'])
export class CompanyRole extends TimestampEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @Index('IDX_company_roles_companyId')
  company: Company;

  @Column('text')
  name: string;

  @Column('text', { nullable: true })
  description?: string;

  @Column('boolean', { default: false })
  isSystemDefault: boolean;

  @OneToMany(
    () => CompanyRolePermission,
    (rolePermission) => rolePermission.role,
    { cascade: true, eager: true },
  )
  permissions: CompanyRolePermission[];

  @OneToMany(() => CompanyCollaborator, (collaborator) => collaborator.role)
  collaborators: CompanyCollaborator[];
}
