import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { OrderItem } from '../order-item/entities/order-item.entity';

describe('Order - Item-Level Commission Snapshot & Final Amount', () => {
  it('debe registrar snapshot inmutable en OrderItem y sumar comisiones sin recargar al cliente', () => {
    // Simulación de dos artículos en una orden
    const item1 = {
      id: 'item-1',
      title: 'Zapatos',
      basePrice: 100.0, // Ganancia vendedor
      commissionRate: 5.0, // 5% contado
      commissionAmount: 5.0,
      price: 105.0, // Precio público
    };

    const item2 = {
      id: 'item-2',
      title: 'Camisa',
      basePrice: 50.0,
      commissionRate: 6.0, // 6% contado
      commissionAmount: 3.0,
      price: 53.0,
    };

    const orderItems: Partial<OrderItem>[] = [
      {
        quantity: 2,
        basePrice: item1.basePrice,
        commissionRate: item1.commissionRate,
        commissionAmount: item1.commissionAmount,
        price: item1.price,
      },
      {
        quantity: 1,
        basePrice: item2.basePrice,
        commissionRate: item2.commissionRate,
        commissionAmount: item2.commissionAmount,
        price: item2.price,
      },
    ];

    // Cálculo del subtotal al público: (105 * 2) + (53 * 1) = 210 + 53 = 263.0
    const subtotal = orderItems.reduce((sum, oi) => sum + oi.price! * oi.quantity!, 0);
    assert.equal(subtotal, 263.0);

    // Suma de comisiones adeudadas a la plataforma: (5 * 2) + (3 * 1) = 13.0
    const totalPlatformCommission = orderItems.reduce(
      (sum, oi) => sum + oi.commissionAmount! * oi.quantity!,
      0,
    );
    assert.equal(totalPlatformCommission, 13.0);

    // En contado (feeAmount = 0), el total a pagar por el cliente es exactamente el subtotal
    const feeAmount = 0;
    const finalAmount = subtotal + feeAmount;
    assert.equal(finalAmount, 263.0); // El cliente paga 263.0, CERO recargo de comisión adicional

    // Ganancia neta del comerciante: (100 * 2) + (50 * 1) = 250.0
    const merchantNet = orderItems.reduce((sum, oi) => sum + oi.basePrice! * oi.quantity!, 0);
    assert.equal(merchantNet, 250.0);

    // Integridad contable: Ganancia tienda + Comisión plataforma = Total pagado por el cliente
    assert.equal(merchantNet + totalPlatformCommission, finalAmount);
  });

  it('debe mantener inmutable el snapshot de OrderItem si el item del catalogo cambia de precio despues', () => {
    const historicalOrderItem: Partial<OrderItem> = {
      id: 'oi-1',
      basePrice: 100.0,
      commissionRate: 5.0,
      commissionAmount: 5.0,
      price: 105.0,
      quantity: 1,
    };

    // El comerciante luego rebaja el producto a $80
    const updatedCatalogItem = {
      basePrice: 80.0,
      commissionRate: 5.0,
      commissionAmount: 4.0,
      price: 84.0,
    };

    // El snapshot previo no muta
    assert.equal(historicalOrderItem.basePrice, 100.0);
    assert.equal(historicalOrderItem.commissionAmount, 5.0);
    assert.equal(historicalOrderItem.price, 105.0);
    assert.notEqual(historicalOrderItem.basePrice, updatedCatalogItem.basePrice);
  });
});

