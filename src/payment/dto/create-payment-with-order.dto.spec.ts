import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreatePaymentDto } from './create-payment.dto';
import { CreatePaymentWithOrderDto } from './create-payment-with-order.dto';

describe('CreatePaymentWithOrderDto & CreatePaymentDto Validation', () => {
  const storeId = 'e3726b99-c949-4fe3-9518-a3c96a5b0878';
  const itemId = '747d3aa1-cf31-428d-8e25-d21f22e91f10';

  const baseOrder = {
    storeId,
    isPartialPayment: true,
    items: [{ itemId, quantity: 1 }],
  };

  const validationOptions = {
    whitelist: true,
    forbidNonWhitelisted: true,
  };

  it('allows amount = 0 in CreatePaymentWithOrderDto without paymentMethod or reference', async () => {
    const dto = plainToInstance(CreatePaymentWithOrderDto, {
      order: baseOrder,
      payment: {
        amount: 0,
        currency: 'USD',
        storeId,
      },
    });

    const errors = await validate(dto, validationOptions);
    expect(errors).toHaveLength(0);
    expect(dto.payment.amount).toBe(0);
  });

  it('allows amount = 0 in CreatePaymentWithOrderDto with explicit null paymentMethod and reference', async () => {
    const dto = plainToInstance(CreatePaymentWithOrderDto, {
      order: baseOrder,
      payment: {
        amount: 0,
        currency: 'USD',
        paymentMethod: null,
        reference: null,
        receiptImage: null,
        storeId,
      },
    });

    const errors = await validate(dto, validationOptions);
    expect(errors).toHaveLength(0);
  });

  it('rejects amount = 10 in CreatePaymentWithOrderDto when paymentMethod or reference is missing', async () => {
    const dtoMissingBoth = plainToInstance(CreatePaymentWithOrderDto, {
      order: baseOrder,
      payment: {
        amount: 10,
        currency: 'USD',
        storeId,
      },
    });

    const errorsBoth = await validate(dtoMissingBoth, validationOptions);
    expect(errorsBoth.length).toBeGreaterThan(0);

    const dtoMissingRef = plainToInstance(CreatePaymentWithOrderDto, {
      order: baseOrder,
      payment: {
        amount: 10,
        currency: 'USD',
        paymentMethod: 'PAGO_MOVIL',
        storeId,
      },
    });

    const errorsRef = await validate(dtoMissingRef, validationOptions);
    expect(errorsRef.length).toBeGreaterThan(0);
  });

  it('accepts amount = 10 in CreatePaymentWithOrderDto when paymentMethod and reference are provided', async () => {
    const dto = plainToInstance(CreatePaymentWithOrderDto, {
      order: baseOrder,
      payment: {
        amount: 10,
        currency: 'USD',
        paymentMethod: 'PAGO_MOVIL',
        reference: 'REF-123456',
        storeId,
      },
    });

    const errors = await validate(dto, validationOptions);
    expect(errors).toHaveLength(0);
  });

  it('still rejects amount = 0 in CreatePaymentDto (POST /payment)', async () => {
    const dto = plainToInstance(CreatePaymentDto, {
      amount: 0,
      currency: 'USD',
      paymentMethod: 'PAGO_MOVIL',
      reference: 'REF-123',
      storeId,
    });

    const errors = await validate(dto, validationOptions);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.property === 'amount')).toBe(true);
  });
});
