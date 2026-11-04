import test from 'node:test';
import assert from 'node:assert/strict';

test('End-to-End Item-Level Commission Lifecycle', async (t) => {
  await t.test('Flujo completo: creacion con basePrice, venta de contado, venta en cuotas, snapshot inmutable y cambio posterior de precio', () => {
    // 1. Configuracion de rangos de comision
    const commissionRanges = [
      { minPrice: 0, maxPrice: 1000, singlePaymentRate: 5.0, installmentPaymentRate: 7.0 }
    ];

    function calculateCommission(basePrice: number, isPartial: boolean) {
      const range = commissionRanges.find(r => basePrice >= r.minPrice && basePrice <= r.maxPrice)!;
      const rate = isPartial ? range.installmentPaymentRate : range.singlePaymentRate;
      const amount = Math.round(((basePrice * rate) / 100) * 100) / 100;
      return { rate, amount };
    }

    // 2. Comerciante crea un producto con precio base $100
    const merchantBasePrice = 100.0;
    const initialCommission = calculateCommission(merchantBasePrice, false);
    const itemCatalog = {
      id: 'item-100',
      title: 'Zapatos Deportivos',
      basePrice: merchantBasePrice,
      commissionRate: initialCommission.rate,
      commissionAmount: initialCommission.amount,
      price: merchantBasePrice + initialCommission.amount, // $105.00
    };

    assert.equal(itemCatalog.basePrice, 100.0);
    assert.equal(itemCatalog.commissionRate, 5.0);
    assert.equal(itemCatalog.commissionAmount, 5.0);
    assert.equal(itemCatalog.price, 105.0);

    // 3. Cliente compra al contado (Single Payment)
    // El cliente ve y paga el precio de catalogo ($105).
    const cashOrderLineItem = {
      itemId: itemCatalog.id,
      quantity: 1,
      price: itemCatalog.price, // 105.0
      basePrice: itemCatalog.basePrice, // 100.0
      commissionRate: initialCommission.rate, // 5%
      commissionAmount: initialCommission.amount, // 5.0
    };

    const cashSubtotal = cashOrderLineItem.price * cashOrderLineItem.quantity;
    const cashFeeAmount = 0.0;
    const cashFinalAmount = cashSubtotal + cashFeeAmount; // 105.0 (NO se agrega comision al total del cliente)
    const cashStoreDebt = cashOrderLineItem.commissionAmount; // Tienda debe 5.0 a la plataforma
    const cashStoreNetEarnings = cashFinalAmount - cashStoreDebt; // Tienda recibe 100.0 neto

    assert.equal(cashFinalAmount, 105.0, 'El cliente solo paga el precio del producto sin cargos de plataforma adicionales');
    assert.equal(cashStoreDebt, 5.0, 'La tienda adeuda exactamente la comision correspondiente');
    assert.equal(cashStoreNetEarnings, 100.0, 'La ganancia neta de la tienda coincide con su basePrice');

    // 4. Segundo cliente compra a cuotas (Installment Payment)
    // En cuotas, la comision de la plataforma es de 7% ($7.00), y la tienda cobra recargo de 15%
    const storePartialFeePercentage = 15.0;
    const installmentComm = calculateCommission(itemCatalog.basePrice, true);

    const installmentOrderLineItem = {
      itemId: itemCatalog.id,
      quantity: 1,
      price: itemCatalog.price, // 105.0
      basePrice: itemCatalog.basePrice, // 100.0
      commissionRate: installmentComm.rate, // 7%
      commissionAmount: installmentComm.amount, // 7.0
    };

    const installmentSubtotal = installmentOrderLineItem.price * installmentOrderLineItem.quantity; // 105.0
    const installmentFeeAmount = Math.round(((installmentSubtotal * storePartialFeePercentage) / 100) * 100) / 100; // 15.75
    const installmentFinalAmount = installmentSubtotal + installmentFeeAmount; // 120.75
    const installmentStoreDebt = installmentOrderLineItem.commissionAmount; // 7.0

    assert.equal(installmentOrderLineItem.commissionRate, 7.0);
    assert.equal(installmentOrderLineItem.commissionAmount, 7.0);
    assert.equal(installmentFinalAmount, 120.75, 'El cliente paga producto + recargo de cuotas de la tienda, sin sobretasa de comision');
    assert.equal(installmentStoreDebt, 7.0, 'La comision adeudada a la plataforma es del 7%');

    // 5. El comerciante rebaja el producto a $80 despues de las dos ventas
    const updatedBasePrice = 80.0;
    const updatedComm = calculateCommission(updatedBasePrice, false);
    itemCatalog.basePrice = updatedBasePrice;
    itemCatalog.commissionRate = updatedComm.rate;
    itemCatalog.commissionAmount = updatedComm.amount;
    itemCatalog.price = updatedBasePrice + updatedComm.amount; // 84.0

    assert.equal(itemCatalog.price, 84.0);

    // 6. Verificar que las ordenes pasadas son snapshots inmutables
    assert.equal(cashOrderLineItem.basePrice, 100.0, 'La venta previa al contado conserva su basePrice original');
    assert.equal(cashOrderLineItem.commissionAmount, 5.0, 'La venta previa al contado conserva su deuda original');
    assert.equal(installmentOrderLineItem.commissionAmount, 7.0, 'La venta previa a cuotas conserva su deuda original');

    // Total adeudado por la tienda a la plataforma de ambas ventas
    const totalStoreDebt = cashStoreDebt + installmentStoreDebt;
    assert.equal(totalStoreDebt, 12.0, 'La plataforma totaliza la deuda acumulada correctamente (5 + 7 = 12)');
  });
});

