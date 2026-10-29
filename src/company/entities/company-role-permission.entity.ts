import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  Unique,
  Index,
} from 'typeorm';
import { TimestampEntity } from 'src/common/entities/timestamp.entity';
import { CompanyRole } from './company-role.entity';

@Entity('company_role_permissions')
@Unique(['role', 'permission'])
export class CompanyRolePermission extends TimestampEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => CompanyRole, (role) => role.permissions, {
    onDelete: 'CASCADE',
  })
  @Index('IDX_company_role_permissions_roleId')
  role: CompanyRole;

  @Column('text')
  @Index('IDX_company_role_permissions_perm')
  permission: string;
}
