import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { User } from "src/user/entities/user.entity";

const columnNumericTransformer = {
  to: (data: number): number => data,
  from: (data: string): number => parseFloat(data),
};

@Entity('addresses')
export class Address {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('text')
  title: string;

  @Column('text')
  fullAddress: string;

  @Column('text', {
    nullable: true
  })
  reference: string;

  @Column('numeric', {
    transformer: columnNumericTransformer,
  })
  latitude: number;

  @Column('numeric', {
    transformer: columnNumericTransformer,
  })
  longitude: number;

  @Column('boolean', {
    default: true
  })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: string;

  @UpdateDateColumn()
  updatedAt: string;

  @ManyToOne(() => User, (user) => user.addresses)
  @JoinColumn({ name: 'user_id' })
  user: User;
}