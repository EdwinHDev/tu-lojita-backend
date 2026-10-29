import {
  BeforeInsert,
  BeforeUpdate,
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { TimestampEntity } from 'src/common/entities/timestamp.entity';
import * as bcrypt from 'bcrypt';
import { UserRole } from '../types';
import { Address } from 'src/address/entities/address.entity';
import { Company } from 'src/company/entities/company.entity';
import { Store } from 'src/store/entities/store.entity';
import { Order } from 'src/order/entities/order.entity';
import { Payment } from 'src/payment/entities/payment.entity';
import { Notification } from 'src/notification/entities/notification.entity';
import { UserSuspension } from './user-suspension.entity';

@Entity('users')
export class User extends TimestampEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('text')
  firstName: string;

  @Column('text', {
    nullable: true,
  })
  lastName?: string;

  @Column('text', {
    unique: true,
  })
  email: string;

  @Column('text', {
    nullable: true,
  })
  identification?: string;

  @Column('text', {
    nullable: true,
  })
  phone?: string;

  @Column('text', {
    unique: true,
    nullable: true,
  })
  googleId: string;

  @Column('text', {
    nullable: true,
  })
  avatarUrl: string;

  @Column({ type: 'text', select: false, nullable: true })
  password: string;

  @Column('date', {
    nullable: true,
  })
  birthDate?: Date;

  get isAdult(): boolean {
    return isUserAdult(this);
  }

  @Column('bool', {
    default: true,
  })
  isActive: boolean;

  @Column('bool', {
    default: false,
    select: false,
  })
  confirm: boolean;

  @Column('text', {
    select: false,
    nullable: true,
  })
  confirmToken?: string;

  @Column({
    type: 'enum',
    enum: UserRole,
    default: UserRole.USER,
  })
  role: UserRole;

  @Column('timestamp with time zone', {
    nullable: true,
  })
  chatSuspendedUntil?: Date | null;

  @Column('bool', {
    default: false,
  })
  isChatBannedPermanently: boolean;

  @Column('text', {
    nullable: true,
  })
  chatSuspensionReason?: string | null;

  @Column({
    type: 'text',
    array: true,
    default: [],
  })
  chatSuspensionEvidence?: string[];

  // Anti-fraud payment penalty and account suspension fields
  @Column('int', { default: 0 })
  consecutiveRejectedPaymentsCount: number;

  @Column('timestamp with time zone', { nullable: true })
  lastRejectedPaymentAt?: Date | null;

  @Column('int', { default: 0 })
  consecutiveApprovedPaymentsCount: number;

  @Column('timestamp with time zone', { nullable: true })
  accountSuspendedUntil?: Date | null;

  @Column('text', { nullable: true })
  accountSuspensionReason?: string | null;

  @Column('uuid', { nullable: true })
  currentSuspensionId?: string | null;

  @ManyToOne(() => UserSuspension, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'currentSuspensionId' })
  currentSuspension?: UserSuspension | null;

  @OneToMany(() => UserSuspension, (suspension) => suspension.user)
  suspensions?: UserSuspension[];

  // Promedio de calificaciones de comprador (actualizado por ReviewService)
  @Column('decimal', {
    precision: 3,
    scale: 1,
    default: 0,
    nullable: true,
  })
  averageBuyerRating: number;

  @Column('int', { default: 0 })
  totalBuyerReviews: number;

  @OneToMany(() => Address, (address) => address.user)
  addresses: Address[];

  // Relación con la empresa (para usuarios con rol COMPANY)
  @ManyToOne(() => Company, { nullable: true })
  company?: Company;

  // Relación con la tienda (para usuarios con rol VENDOR)
  @ManyToOne(() => Store, { nullable: true })
  store?: Store;

  @OneToMany(() => Order, (order) => order.user)
  orders: Order[];

  @OneToMany(() => Payment, (payment) => payment.user)
  payments: Payment[];

  @OneToMany(() => Notification, (notification) => notification.user)
  notifications: Notification[];

  @BeforeInsert()
  @BeforeUpdate()
  beforeInsert() {
    this.email = this.email.toLowerCase().trim();
    if (this.password) {
      this.password = bcrypt.hashSync(this.password, 10);
    }
  }
}

export function isUserAdult(
  user?: {
    birthDate?: Date | string;
    role?: UserRole | string;
    roles?: string[];
  } | null,
): boolean {
  if (!user) return false;
  // Administradores y comercios tienen acceso completo al catálogo para gestión y clasificación
  if (user.role === UserRole.ADMIN || user.roles?.includes(UserRole.ADMIN)) {
    return true;
  }
  if (
    user.role === UserRole.COMPANY ||
    user.role === UserRole.VENDOR ||
    user.roles?.includes(UserRole.COMPANY) ||
    user.roles?.includes(UserRole.VENDOR)
  ) {
    return true;
  }
  if (!user.birthDate) return false;
  const today = new Date();
  const birth = new Date(user.birthDate);
  if (isNaN(birth.getTime())) return false;
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age >= 18;
}
