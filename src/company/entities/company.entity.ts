import {
  PrimaryGeneratedColumn,
  Column,
  Entity,
  OneToMany,
  ManyToOne,
  OneToOne,
} from 'typeorm';
import { TimestampEntity } from 'src/common/entities/timestamp.entity';
import { Store } from 'src/store/entities/store.entity';
import { User } from 'src/user/entities/user.entity';
import { Subcategory } from 'src/subcategory/entities/subcategory.entity';
import { CompanySubscription } from 'src/subscription/entities/company-subscription.entity';
import { CompanyRole } from './company-role.entity';
import { CompanyCollaborator } from './company-collaborator.entity';

@Entity('companies')
export class Company extends TimestampEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('text')
  name: string;

  @Column('text')
  rif: string;

  @Column('text')
  logo: string;

  @Column('text', { nullable: true })
  phone?: string;

  @Column('text', { nullable: true })
  description?: string;

  // Rubro comercial / subcategoría de la empresa (determina el rubro de sus sucursales)
  @ManyToOne(() => Subcategory, { nullable: true })
  subcategory?: Subcategory;

  // Relación con tiendas: Una empresa puede tener una o más tiendas
  @OneToMany(() => Store, (store) => store.company)
  stores: Store[];

  // Propietario de la empresa (usuario que la creó)
  @ManyToOne(() => User, { nullable: true })
  owner?: User;

  // Suscripción de la empresa ($20/mes)
  @OneToOne(() => CompanySubscription, (sub) => sub.company, { nullable: true })
  subscription?: CompanySubscription;

  // Roles personalizados de la empresa
  @OneToMany(() => CompanyRole, (role) => role.company)
  roles: CompanyRole[];

  // Colaboradores de la empresa
  @OneToMany(() => CompanyCollaborator, (collaborator) => collaborator.company)
  collaborators: CompanyCollaborator[];
}
