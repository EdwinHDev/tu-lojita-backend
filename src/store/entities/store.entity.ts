import { PrimaryGeneratedColumn, Column, Entity, CreateDateColumn, UpdateDateColumn, ManyToOne } from "typeorm";
import { Company } from "src/company/entities/company.entity";
import { Category } from "src/category/entities/category.entity";
import { User } from "src/user/entities/user.entity";

@Entity('stores')
export class Store {

  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('text')
  name: string;

  @Column('text')
  description: string;

  @Column('text')
  rif: string;

  @Column('text')
  phone: string;

  @Column('text', {
    nullable: true
  })
  address: string;

  @Column('text', {
    nullable: true
  })
  city: string;

  @Column('text', {
    nullable: true
  })
  state: string;

  @Column('text')
  logo: string;

  // Relación con la empresa a la que pertenece la tienda (Opcional)
  @ManyToOne(() => Company, (company) => company.stores, { nullable: true })
  company?: Company;

  // Relación con la categoría de la tienda
  @ManyToOne(() => Category, (category) => category.stores)
  category: Category;

  // Propietario de la tienda (usuario que la creó)
  @ManyToOne(() => User, { nullable: true })
  owner?: User;

  @CreateDateColumn()
  createdAt: string;

  @UpdateDateColumn()
  updatedAt: string;

}
