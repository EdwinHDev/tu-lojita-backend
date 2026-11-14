jest.mock('@nestjs/common/utils/load-package.util', () => ({
  loadPackage: jest.fn(),
}));

jest.mock('@nestjs/typeorm', () => ({
  InjectRepository: () => () => undefined,
}));

import { PaymentService } from './payment.service';
import { OrderService } from '../order/order.service';
import { Payment } from './entities/payment.entity';
import { PaymentStatus } from './types';
import { Order } from '../order/entities/order.entity';
import { Installment } from '../order/entities/installment.entity';
import { InstallmentStatus, OrderStatus } from '../order/types';

describe('Installment Historical Exchange Rate Sealing & Calendar Query', () => {
  const createQueryRunnerMock = () => {
    const manager = {
      findOne: jest.fn(),
      find: jest.fn(),
      save: jest.fn(async (entity: any) => entity),
      create: jest.fn((_: any, data: any) => data),
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

    return { queryRunner, manager };
  };

  it('seals paidExchangeRate and paidAmountBs when approving a payment that settles an installment and preserves prior installment rate', async () => {
    const { queryRunner, manager } = createQueryRunnerMock();

    const inst1: any = {
      id: 'inst-1',
      amount: 50,
      paidAmount: 50,
      lateFeeApplied: 0,
      status: InstallmentStatus.PAID,
      paymentDate: new Date('2026-11-01T12:00:00Z'),
      paidExchangeRate: 36.5,
      paidAmountBs: 1825,
    };
    const inst2: any = {
      id: 'inst-2',
      amount: 50,
      paidAmount: 0,
      lateFeeApplied: 0,
      status: InstallmentStatus.PENDING,
      paymentDate: null,
      paidExchangeRate: null,
      paidAmountBs: null,
    };

    const orderObj: any = {
      id: 'order-1',
      status: OrderStatus.PARTIALLY_PAID,
      isPartialPayment: true,
      finalAmount: 100,
      totalPaidAmount: 50,
      remainingBalance: 50,
      balance: 50,
      exchangeRate: 36.5,
      platformCommissionAmount: 0,
      user: { id: 'user-1', firstName: 'Ana', lastName: 'Pérez', email: 'a@b.com' },
      payments: [
        {
          id: 'pay-1',
          amount: 50,
          status: PaymentStatus.APPROVED,
          exchangeRate: 36.5,
          createdAt: new Date('2026-11-01T12:00:00Z'),
        },
        {
          id: 'pay-2',
          amount: 50,
          status: PaymentStatus.WAITING_VERIFICATION,
          exchangeRate: 42.25,
          createdAt: new Date('2026-11-10T12:00:00Z'),
        },
      ],
    };

    const paymentObj: any = {
      id: 'pay-2',
      amount: 50,
      status: PaymentStatus.WAITING_VERIFICATION,
      exchangeRate: 42.25,
      paymentMethod: 'PAGO_MOVIL',
      createdAt: new Date('2026-11-10T12:00:00Z'),
      order: orderObj,
      user: orderObj.user,
      store: {
        id: 'store-1',
        name: 'Tienda Demo',
        owner: { id: 'owner-1' },
        company: { id: 'comp-1' },
        minInitialPaymentPercentage: 50,
      },
    };

    manager.findOne.mockImplementation(async (entity: any, opts: any) => {
      if (entity === Payment) return paymentObj;
      if (entity === Order) return orderObj;
      return null;
    });
    manager.find.mockImplementation(async (entity: any) => {
      if (entity === Installment) return [inst1, inst2];
      return [];
    });

    const dataSourceMock: any = {
      createQueryRunner: () => queryRunner,
      getRepository: jest.fn(),
    };
    const notificationMock: any = {
      createNotification: jest.fn().mockResolvedValue(undefined),
      notifyUser: jest.fn().mockResolvedValue(undefined),
      notifyStoreInstallmentsUpdated: jest.fn(),
      notifyOrderUpdated: jest.fn(),
    };
    const mailMock: any = {
      sendPaymentStatusEmail: jest.fn().mockResolvedValue(undefined),
      sendPaymentApproved: jest.fn().mockResolvedValue(undefined),
      sendPaymentRejected: jest.fn().mockResolvedValue(undefined),
    };
    const commissionMock: any = {};
    const platformSettingsMock: any = {
      getExchangeRateConfig: jest.fn().mockResolvedValue({ rate: 42.25 }),
      isFraudPenaltyEnabled: jest.fn().mockResolvedValue(false),
    };
    const activityLogMock: any = {
      log: jest.fn(),
    };

    const service = new PaymentService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      dataSourceMock,
      notificationMock,
      mailMock,
      commissionMock,
      platformSettingsMock,
      activityLogMock,
    );

    await service.verifyPayment('pay-2', PaymentStatus.APPROVED, 'owner-1');

    expect(inst1.status).toBe(InstallmentStatus.PAID);
    expect(inst1.paidExchangeRate).toBe(36.5);
    expect(inst1.paidAmountBs).toBe(1825);

    expect(inst2.status).toBe(InstallmentStatus.PAID);
    expect(inst2.paidExchangeRate).toBe(42.25);
    expect(inst2.paidAmountBs).toBe(2112.5);
  });

  it('includes order.store.company and order.payments relations in OrderService.getUserInstallmentsCalendar', async () => {
    const mockCalendarRows = [
      {
        id: 'inst-1',
        amount: 50,
        paidAmount: 50,
        paidExchangeRate: 38.4,
        paidAmountBs: 1920,
        order: {
          id: 'order-1',
          exchangeRate: 38.4,
          store: {
            id: 'store-1',
            name: 'Tienda Centro',
            logo: null,
            company: { id: 'comp-1', logo: '/uploads/comp.png' },
          },
          payments: [{ id: 'pay-1', status: 'APPROVED', exchangeRate: 38.4 }],
        },
      },
    ];

    const findMock = jest.fn().mockResolvedValue(mockCalendarRows);
    const dataSourceMock: any = {
      getRepository: jest.fn().mockReturnValue({ find: findMock }),
    };

    const orderService = new OrderService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      dataSourceMock,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    const result = await orderService.getUserInstallmentsCalendar('user-1');

    expect(findMock).toHaveBeenCalledWith({
      where: { order: { user: { id: 'user-1' } } },
      relations: [
        'order',
        'order.store',
        'order.store.company',
        'order.payments',
      ],
      order: { dueDate: 'ASC' },
    });
    expect(result.items).toHaveLength(1);
    expect(result.items[0].paidExchangeRate).toBe(38.4);
    expect(result.items[0].paidAmountBs).toBe(1920);
    expect(result.items[0].installmentNumber).toBe(1);
  });

  it('paginates OrderService.getUserInstallmentsCalendar by status while keeping global summary accurate', async () => {
    const mockCalendarRows = Array.from({ length: 28 }, (_, i) => {
      const isPaid = i >= 25;
      const dueDate =
        i < 2
          ? new Date(Date.now() - (2 - i) * 86400000)
          : new Date(Date.now() + (i + 1) * 86400000);
      return {
        id: `inst-${i + 1}`,
        amount: 10,
        paidAmount: isPaid ? 10 : 0,
        status: isPaid ? 'PAID' : i < 2 ? 'OVERDUE' : 'PENDING',
        dueDate,
        order: {
          id: i % 2 === 0 ? 'order-a' : 'order-b',
          exchangeRate: 40,
          store: { id: 'store-1', name: 'Tienda', company: { id: 'comp-1' } },
          payments: [],
        },
      };
    });

    const findMock = jest.fn().mockResolvedValue(mockCalendarRows);
    const dataSourceMock: any = {
      getRepository: jest.fn().mockReturnValue({ find: findMock }),
    };

    const orderService = new OrderService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      dataSourceMock,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    const page1 = await orderService.getUserInstallmentsCalendar('user-1', {
      page: 1,
      limit: 20,
      status: 'active',
    });

    expect(page1.items).toHaveLength(20);
    expect(page1.total).toBe(25);
    expect(page1.page).toBe(1);
    expect(page1.limit).toBe(20);
    expect(page1.hasMore).toBe(true);
    expect(page1.summary.totalActiveDebtUsd).toBe(250);
    expect(page1.summary.overdueCount).toBe(2);
    expect(page1.summary.totalActiveCount).toBe(25);
    expect(page1.summary.totalPaidCount).toBe(3);

    const page2 = await orderService.getUserInstallmentsCalendar('user-1', {
      page: 2,
      limit: 20,
      status: 'active',
    });

    expect(page2.items).toHaveLength(5);
    expect(page2.hasMore).toBe(false);
    expect(page2.summary.totalActiveDebtUsd).toBe(250);

    const paidPage = await orderService.getUserInstallmentsCalendar('user-1', {
      page: 1,
      limit: 20,
      status: 'paid',
    });

    expect(paidPage.items).toHaveLength(3);
    expect(paidPage.total).toBe(3);
    expect(paidPage.summary.totalActiveDebtUsd).toBe(250);
  });
});
