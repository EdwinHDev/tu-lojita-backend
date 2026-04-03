import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { Order } from "../../order/entities/order.entity";
import { Item } from "../../item/entities/item.entity";

@Entity('order_items')
export class OrderItem {

  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('text')
  title: string; // Snapshot del nombre del producto/servicio

  @Column('int')
  quantity: number;

  @Column('decimal', {
    precision: 12,
    scale: 2,
    transformer: {
      to: (value: number) => value,
      from: (value: string) => parseFloat(value),
    }
  })
  price: number; // Snapshot del precio al momento de la compra

  @ManyToOne(() => Order, (order) => order.orderItems, { onDelete: 'CASCADE' })
  order: Order;

  @ManyToOne(() => Item)
  item: Item;

}
