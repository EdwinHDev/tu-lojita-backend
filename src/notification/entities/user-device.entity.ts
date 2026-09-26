import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Unique,
  Index,
} from 'typeorm';
import { TimestampEntity } from 'src/common/entities/timestamp.entity';
import { User } from 'src/user/entities/user.entity';

@Entity('user_devices')
@Unique(['userId', 'deviceId'])
export class UserDevice extends TimestampEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column()
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'text' })
  fcmToken: string;

  @Column({ type: 'varchar', length: 50, default: 'android' })
  platform: string;

  @Column({ type: 'varchar', length: 255 })
  deviceId: string;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  lastActiveAt: Date;
}
