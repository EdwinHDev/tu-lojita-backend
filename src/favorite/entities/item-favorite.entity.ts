import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { TimestampEntity } from 'src/common/entities/timestamp.entity';
import { User } from 'src/user/entities/user.entity';
import { Item } from 'src/item/entities/item.entity';

@Entity('item_favorites')
@Unique(['user', 'item'])
export class ItemFavorite extends TimestampEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'userId' })
  @Index()
  user: User;

  @Column('uuid')
  userId: string;

  @ManyToOne(() => Item, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'itemId' })
  @Index()
  item: Item;

  @Column('uuid')
  itemId: string;

  @Column('numeric', {
    transformer: {
      to: (value: number) => value,
      from: (value: string) => parseFloat(value),
    },
  })
  priceWhenAdded: number;
}
