import { PrimaryGeneratedColumn, Column, Entity, CreateDateColumn, UpdateDateColumn, OneToMany, ManyToOne } from "typeorm";
import { Store } from "src/store/entities/store.entity";
import { User } from "src/user/entities/user.entity";

@Entity('companies')
export class Company {

  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('text')
  name: string;

  @Column('text')
  rif: string;

  @Column('text')
  logo: string;

  // Relación con tiendas: Una empresa puede tener una o más tiendas
  @OneToMany(() => Store, (store) => store.company)
  stores: Store[];

  // Propietario de la empresa (usuario que la creó)
  @ManyToOne(() => User, { nullable: true })
  owner?: User;

  @CreateDateColumn()
  createdAt: string;

  @UpdateDateColumn()
  updatedAt: string;

}
