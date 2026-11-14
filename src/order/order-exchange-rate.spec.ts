jest.mock('@nestjs/common/utils/load-package.util', () => ({
  loadPackage: jest.fn(),
}));

jest.mock('@nestjs/typeorm', () => ({
  InjectRepository: () => () => undefined,
}));

import { OrderService } from './order.service';
import { PaymentService } from '../payment/payment.service';
import { Order } from './entities/order.entity';
import { Payment } from '../payment/entities/payment.entity';
import { OrderStatus } from './types';
import { PaymentStatus } from '../payment/types';
import { StoreStatus } from '../store/types/status.enum';
import { PreOrderStatus } from './types/preorder-status.enum';

describe('Order and Payment Historical Exchange Rate', () => {
  const createQueryRunnerMock = () => {
    const savedEntities: any[] = [];
    const manager = {
      create: jest.fn((EntityClass: any, data: any) => ({
        __entity: EntityClass?.name,
        ...data,
      })),
      save: jest.fn(async (entityOrArray: any, maybeEntity?: any) => {
        const target = maybeEntity ?? entityOrArray;
        if (Array.isArray(target)) {
          savedEntities.push(...target);
          return target;
        }
        const saved = { id: target.id || 'generated-id', ...target };
        savedEntities.push(saved);
        return saved;
      }),
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      update: jest.fn(),
    };

    const queryRunner = {
      connect: jest.fn().mockResolvedValue(undefined),
      startTransaction: jest.fn().mockResolvedValue(undefined),
      commitTransaction: jest.fn().mockResolvedValue(undefined),
      rollbackTransaction: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
      manager,
    };

    return { queryRunner, manager, savedEntities };
  };

  it('persists active BCV exchangeRate on Order in OrderService.create', async () => {
    const { queryRunner, manager } = createQueryRunnerMock();
    manager.findOne.mockImplementation(async (entity: any) => {
      if (entity?.name === 'StoreCustomerBlock') return null;
      return {
        id: 'item-1',
        title: 'Producto Prueba',
        price: 50,
        discountPrice: null,
        stock: 10,
        status: 'PUBLISHED',
        itemType: 'PRODUCT',
        variants: [],
        store: { id: 'store-1' },
      };
    });

    const storeRepo = {
      findOneBy: jest.fn().mockResolvedValue({
        id: 'store-1',
        status: StoreStatus.ACTIVE,
        owner: { id: 'owner-1' },
      }),
    };
    const userRepo = {
      findOneBy: jest.fn().mockResolvedValue({
        id: 'user-1',
        email: 'buyer@test.com',
        firstName: 'Ana',
        lastName: 'Perez',
      }),
    };
    const dataSource = {
      createQueryRunner: jest.fn(() => queryRunner),
      getRepository: jest.fn().mockReturnValue({
        findOne: jest.fn().mockResolvedValue(null),
      }),
    };
    const commissionService = {
      resolveRateForStore: jest.fn().mockResolvedValue(5),
    };
    const platformSettingsService = {
      getExchangeRateConfig: jest.fn().mockResolvedValue({
        enabled: true,
        rate: 54.321,
      }),
    };

    const orderRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 'generated-id',
        exchangeRate: 54.321,
      }),
    };

    const service = new OrderService(
      orderRepo as any,
      storeRepo as any,
      {} as any,
      {} as any,
      userRepo as any,
      {} as any,
      {} as any,
      {} as any,
      dataSource as any,
      { notifyUser: jest.fn() } as any,
      { sendOrderCreatedNotification: jest.fn().mockResolvedValue(undefined) } as any,
      commissionService as any,
      { evaluateEvent: jest.fn().mockResolvedValue(undefined) } as any,
      { logActivity: jest.fn().mockResolvedValue(undefined) } as any,
      platformSettingsService as any,
    );

    const result = await service.create(
      {
        storeId: 'store-1',
        items: [{ itemId: 'item-1', quantity: 1 }],
        isPartialPayment: false,
      } as any,
      'user-1',
    );

    expect(platformSettingsService.getExchangeRateConfig).toHaveBeenCalledTimes(1);
    const createOrderCall = manager.create.mock.calls.find(
      ([entity]) => entity === Order,
    );
    expect(createOrderCall).toBeDefined();
    expect(createOrderCall![1].exchangeRate).toBe(54.321);
    expect((result as any).exchangeRate).toBe(54.321);
  });

  it('persists active BCV exchangeRate on Payment in OrderService.registerManualPayment', async () => {
    const { queryRunner, manager } = createQueryRunnerMock();
    manager.findOne.mockResolvedValue({
      id: 'order-1',
      status: OrderStatus.PENDING,
      isPartialPayment: false,
      isFullyPaid: false,
      balance: 100,
      remainingBalance: 100,
      totalPaidAmount: 0,
      finalAmount: 100,
      store: { id: 'store-1', name: 'Tienda', owner: { id: 'owner-1' } },
      user: { id: 'user-1', firstName: 'Ana', lastName: 'Perez' },
      payments: [],
      installments: [],
    });

    const dataSource = {
      createQueryRunner: jest.fn(() => queryRunner),
    };
    const platformSettingsService = {
      getExchangeRateConfig: jest.fn().mockResolvedValue({
        enabled: true,
        rate: 48.75,
      }),
    };

    const service = new OrderService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      dataSource as any,
      { notifyUser: jest.fn() } as any,
      {} as any,
      {} as any,
      {} as any,
      { logActivity: jest.fn().mockResolvedValue(undefined) } as any,
      platformSettingsService as any,
    );

    await service.registerManualPayment(
      'order-1',
      { amount: 50, paymentMethod: 'EFECTIVO', reference: 'CAJA-01' } as any,
      'owner-1',
    );

    const createPaymentCall = manager.create.mock.calls.find(
      ([entity]) => entity === Payment,
    );
    expect(createPaymentCall).toBeDefined();
    expect(createPaymentCall![1].exchangeRate).toBe(48.75);
  });

  it('includes historical exchangeRate on order and payments in OrderService.getOrderStatement', async () => {
    const orderRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 'order-1',
        createdAt: new Date('2026-01-10T12:00:00Z'),
        totalAmount: '100.00',
        feeAmount: '0.00',
        platformCommissionRate: '5.00',
        platformCommissionAmount: '5.00',
        finalAmount: '100.00',
        totalPaidAmount: '50.00',
        remainingBalance: '50.00',
        isFullyPaid: false,
        status: OrderStatus.PARTIALLY_PAID,
        exchangeRate: '42.5000',
        preOrderStatus: PreOrderStatus.NONE,
        store: { id: 'store-1', name: 'Tienda Test', logo: null, owner: { id: 'owner-1' } },
        user: { id: 'user-1', firstName: 'Carlos', lastName: 'Ruiz' },
        orderItems: [],
        installments: [],
        payments: [
          {
            id: 'pay-1',
            amount: '50.00',
            exchangeRate: '43.1250',
            reference: 'REF123',
            status: PaymentStatus.APPROVED,
            createdAt: new Date('2026-01-10T12:05:00Z'),
            paymentMethod: 'PAGO_MOVIL',
          },
        ],
      }),
    };

    const service = new OrderService(
      orderRepo as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    const statement = await service.getOrderStatement(
      'order-1',
      'owner-1',
      'MERCHANT',
    );
    expect(statement.exchangeRate).toBe(42.5);
    expect(statement.payments[0].exchangeRate).toBe(43.125);
  });

  it('persists active BCV exchangeRate on Payment in PaymentService.create', async () => {
    const { queryRunner, manager } = createQueryRunnerMock();
    const lockedOrder = {
      id: 'order-1',
      status: OrderStatus.PENDING,
      isPartialPayment: false,
      isFullyPaid: false,
      finalAmount: 80,
      balance: 80,
      totalPaidAmount: 0,
      remainingBalance: 80,
      store: { id: 'store-1', name: 'Tienda' },
      user: { id: 'user-1' },
      payments: [],
      installments: [],
    };
    manager.findOne.mockImplementation(async (entity: any) => {
      if (entity === Order) return lockedOrder;
      if (entity?.name === 'Store') return { id: 'store-1', name: 'Tienda', status: StoreStatus.ACTIVE };
      if (entity?.name === 'User') return { id: 'user-1', email: 'u@test.com' };
      return null;
    });

    const dataSource = {
      createQueryRunner: jest.fn(() => queryRunner),
      getRepository: jest.fn().mockReturnValue({
        findOne: jest.fn().mockResolvedValue(lockedOrder),
      }),
    };
    const platformSettingsService = {
      getExchangeRateConfig: jest.fn().mockResolvedValue({
        enabled: true,
        rate: 51.89,
      }),
    };

    const paymentService = new PaymentService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      dataSource as any,
      { notifyUser: jest.fn() } as any,
      {
        sendSinglePaymentUnderReview: jest.fn().mockResolvedValue(undefined),
        sendInstallmentUnderReview: jest.fn().mockResolvedValue(undefined),
      } as any,
      {} as any,
      platformSettingsService as any,
      { logActivity: jest.fn().mockResolvedValue(undefined) } as any,
    );

    await paymentService.create(
      {
        orderId: 'order-1',
        storeId: 'store-1',
        amount: 80,
        currency: 'USD',
        paymentMethod: 'PAGO_MOVIL',
        reference: '998877',
      } as any,
      'user-1',
    );

    const createPaymentCall = manager.create.mock.calls.find(
      ([entity]) => entity === Payment,
    );
    expect(createPaymentCall).toBeDefined();
    expect(createPaymentCall![1].exchangeRate).toBe(51.89);
  });
});
