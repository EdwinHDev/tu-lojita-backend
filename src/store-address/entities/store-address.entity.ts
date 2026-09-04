import { Store } from 'src/store/entities/store.entity';
import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { TimestampEntity } from 'src/common/entities/timestamp.entity';

@Entity('store_addresses')
export class StoreAddress extends TimestampEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('text')
  address: string;

  @Column('text')
  city: string;

  @Column('text')
  state: string;

  /**
   * Coordenadas con precisión de 10,7 para exactitud de metros.
   * Transformer asegura que el valor sea numérico al leer de la DB.
   */
  @Column('numeric', {
    precision: 10,
    scale: 7,
    transformer: {
      to: (value: number) => value,
      from: (value: string) => (value ? parseFloat(value) : null),
    },
  })
  latitude: number;

  @Column('numeric', {
    precision: 10,
    scale: 7,
    transformer: {
      to: (value: number) => value,
      from: (value: string) => (value ? parseFloat(value) : null),
    },
  })
  longitude: number;

  @Column('boolean', { default: false })
  isMain: boolean;

  @ManyToOne(() => Store, (store) => store.addresses)
  store: Store;
}
