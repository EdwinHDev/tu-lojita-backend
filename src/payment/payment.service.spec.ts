jest.mock('@nestjs/common/utils/load-package.util', () => ({
  loadPackage: jest.fn(),
}));

jest.mock('@nestjs/typeorm', () => ({
  InjectRepository: () => () => undefined,
}));

jest.mock('../notification/notification.gateway', () => ({
  NotificationGateway: class {},
  AdminActionType: {},
}));

import { BadRequestException } from '@nestjs/common';
import { PaymentService } from './payment.service';
import { Payment } from './entities/payment.entity';
import { PaymentStatus } from './types';
import { Order } from 'src/order/entities/order.entity';
import { OrderStatus, InstallmentStatus } from 'src/order/types';
import { User } from 'src/user/entities/user.entity';
import { Store } from 'src/store/entities/store.entity';
import { StoreStatus } from 'src/store/types/status.enum';
import { StoreCustomerBlock } from 'src/store/entities/store-customer-block.entity';
import { Item } from 'src/item/entities/item.entity';
import { ItemType } from 'src/item/types/item-type.enum';
import { BookingType } from 'src/item/types/booking-type.enum';
import { ItemPreorderConfig } from 'src/item/entities/item-preorder-config.entity';
import { DepositType } from 'src/item/types/deposit-type.enum';
import { Installment } from 'src/order/entities/installment.entity';
import { InstallmentPeriod } from 'src/store/types/installment-period.enum';
import { PreOrderStatus } from 'src/order/types/preorder-status.enum';
import { buildInstallmentScheduleRows } from 'src/order/utils/installment-math.util';

describe('PaymentService (Zero Initial, Credit Guards, Pre-Order & Scheduling)', () => {
  const storeId = 'e3726b99-c949-4fe3-9518-a3c96a5b0878';
  const userId = '11111111-1111-4111-8111-111111111111';
  const itemId = '747d3aa1-cf31-428d-8e25-d21f22e91f10';

  let service: PaymentService;
  let mockQueryRunner: any;
  let savedEntities: { orders: any[]; installments: any[]; payments: any[]; preorderConfigs: any[] };
  let baseStore: Partial<Store>;
  let baseUser: Partial<User>;
  let baseItem: Partial<Item>;
  let mockPreorderConfig: Partial<ItemPreorderConfig> | null;
  let mockActiveDebtOrders: any[];
  let mockHasOverdue: any;
  let mockHasRejected: any;

  const createPaymentService = () => {
    savedEntities = {
      orders: [],
      installments: [],
      payments: [],
      preorderConfigs: [],
    };

    const stockUpdateBuilder = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    const manager = {
      findOne: jest.fn().mockImplementation(async (entity: any, opts: any) => {
        if (entity === Store) return baseStore;
        if (entity === User) return baseUser;
        if (entity === StoreCustomerBlock) return null;
        if (entity === Installment) return mockHasOverdue;
        if (entity === Order) {
          if (opts?.where?.payments) return mockHasRejected;
          return null;
        }
        if (entity === Item) return baseItem;
        if (entity === ItemPreorderConfig) return mockPreorderConfig;
        if (entity === Payment) return null;
        return null;
      }),
      find: jest.fn().mockImplementation(async (entity: any) => {
        if (entity === Order) return mockActiveDebtOrders;
        return [];
      }),
      create: jest.fn().mockImplementation((_entity: any, data: any) => ({ ...data })),
      save: jest.fn().mockImplementation(async (entityOrArr: any) => {
        if (Array.isArray(entityOrArr)) {
          savedEntities.installments.push(...entityOrArr);
          return entityOrArr;
        }
        if (entityOrArr?.finalAmount !== undefined && entityOrArr?.orderItems === undefined && !entityOrArr?.amount) {
          const saved = {
            id: 'order-created-1',
            createdAt: new Date('2026-11-12T10:00:00Z'),
            ...entityOrArr,
          };
          savedEntities.orders.push(saved);
          return saved;
        }
        if (entityOrArr?.maxPreOrderUnits !== undefined) {
          savedEntities.preorderConfigs.push(entityOrArr);
          return entityOrArr;
        }
        if (entityOrArr?.paymentMethod !== undefined || entityOrArr?.status === PaymentStatus.WAITING_VERIFICATION) {
          const saved = {
            id: 'payment-created-1',
            createdAt: new Date('2026-11-12T10:00:00Z'),
            ...entityOrArr,
          };
          savedEntities.payments.push(saved);
          return saved;
        }
        return entityOrArr;
      }),
      createQueryBuilder: jest.fn().mockReturnValue(stockUpdateBuilder),
    };

    mockQueryRunner = {
      connect: jest.fn().mockResolvedValue(undefined),
      startTransaction: jest.fn().mockResolvedValue(undefined),
      commitTransaction: jest.fn().mockResolvedValue(undefined),
      rollbackTransaction: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
      manager,
    };

    const dataSource: any = {
      createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
    };

    const paymentRepo: any = { findOne: jest.fn(), save: jest.fn() };
    const orderRepo: any = {
      findOne: jest.fn().mockResolvedValue(null),
      save: jest.fn(),
    };
    const userRepo: any = { findOne: jest.fn() };
    const storeRepo: any = { findOne: jest.fn() };
    const notificationService: any = {
      create: jest.fn().mockResolvedValue(undefined),
      notifyStoreInstallmentsUpdated: jest.fn(),
    };
    const mailService: any = {
      sendSinglePaymentUnderReview: jest.fn().mockResolvedValue(undefined),
    };
    const commissionService: any = {
      calculateCommission: jest.fn(),
      voidOrderCommission: jest.fn(),
    };
    const platformSettingsService: any = {};
    const activityLogService: any = { log: jest.fn() };

    service = new PaymentService(
      paymentRepo,
      orderRepo,
      userRepo,
      storeRepo,
      dataSource,
      notificationService,
      mailService,
      commissionService,
      platformSettingsService,
      activityLogService,
    );
  };

  beforeEach(() => {
    baseStore = {
      id: storeId,
      name: 'Inversiones Habla Cloro, C. A.',
      status: StoreStatus.ACTIVE,
      allowPartialPayments: true,
      partialPaymentsFeePercentage: 0,
      minInitialPaymentPercentage: 0,
      maxInstallments: 3,
      maxCreditLimit: 50,
      installmentIntervalValue: 7,
      installmentIntervalUnit: InstallmentPeriod.DAYS,
      installmentFrequencyOptions: [
        { value: 7, unit: InstallmentPeriod.DAYS, label: 'Semanal' },
      ],
      owner: { id: 'owner-1' } as any,
    };

    baseUser = {
      id: userId,
      identification: 'V-12345678',
      firstName: 'Edwin',
      lastName: 'Test',
    };

    baseItem = {
      id: itemId,
      title: 'Cloro 5L',
      price: 30,
      basePrice: 27,
      commissionRate: 11.11,
      commissionAmount: 3,
      itemType: ItemType.PRODUCT,
      bookingType: BookingType.NONE,
      trackInventory: true,
      stockQuantity: 10,
      hasVariants: false,
      allowInstallments: true,
      store: { id: storeId } as any,
      customizationGroupsRel: [],
    };

    mockPreorderConfig = null;
    mockActiveDebtOrders = [];
    mockHasOverdue = null;
    mockHasRejected = null;
    createPaymentService();
  });

  it('allows $0.00 initial checkout for 0% store without inserting Payment row and keeps commissions non-negative', async () => {
    const res: any = await service.createWithOrder(
      {
        order: {
          storeId,
          isPartialPayment: true,
          installmentIntervalValue: 7,
          installmentIntervalUnit: InstallmentPeriod.DAYS,
          items: [{ itemId, quantity: 1 }],
        },
        payment: {
          amount: 0,
          currency: 'USD',
          paymentMethod: null,
          reference: null,
          storeId,
        },
      },
      userId,
    );

    expect(mockQueryRunner.commitTransaction).toHaveBeenCalledTimes(1);
    expect(savedEntities.payments).toHaveLength(0);
    expect(res.paymentMethod).toBe('DEFERRED_ZERO_INITIAL');
    expect(res.status).toBe(PaymentStatus.APPROVED);
    expect(res.amount).toBe(0);
    expect(res.orderId).toBe('order-created-1');

    const createdOrder = savedEntities.orders[0];
    expect(createdOrder.status).toBe(OrderStatus.PARTIALLY_PAID);
    expect(createdOrder.nextDueDate).toBeInstanceOf(Date);

    expect(savedEntities.installments).toHaveLength(3);
    const [inst1, inst2, inst3] = savedEntities.installments;
    expect(inst1.amount).toBe(0);
    expect(inst1.status).toBe(InstallmentStatus.PAID);
    expect(inst1.platformCommissionPortion).toBe(0);
    expect(inst1.storePrincipalAmount).toBe(0);

    expect(inst2.amount).toBe(15);
    expect(inst2.dueDate).toBeInstanceOf(Date);
    expect(inst2.storePrincipalAmount).toBeGreaterThanOrEqual(0);
    expect(inst3.amount).toBe(15);
    expect(inst3.dueDate).toBeNull();
    expect(
      Math.round(
        (inst1.platformCommissionPortion +
          inst2.platformCommissionPortion +
          inst3.platformCommissionPortion) *
          100,
      ) / 100,
    ).toBe(3);
  });

  it('supports "Pagar Más" on 0% initial store creating $10.00 WAITING_VERIFICATION payment and splitting remaining $20.00', async () => {
    const res: any = await service.createWithOrder(
      {
        order: {
          storeId,
          isPartialPayment: true,
          installmentIntervalValue: 7,
          installmentIntervalUnit: InstallmentPeriod.DAYS,
          items: [{ itemId, quantity: 1 }],
        },
        payment: {
          amount: 10,
          currency: 'USD',
          paymentMethod: 'PAGO_MOVIL',
          reference: 'PM-998877',
          storeId,
        },
      },
      userId,
    );

    expect(savedEntities.payments).toHaveLength(1);
    expect(res.amount).toBe(10);
    expect(res.status).toBe(PaymentStatus.WAITING_VERIFICATION);

    const [inst1, inst2, inst3] = savedEntities.installments;
    expect(inst1.amount).toBe(10);
    expect(inst1.status).toBe(InstallmentStatus.PENDING);
    expect(inst2.amount).toBe(10);
    expect(inst3.amount).toBe(10);
  });

  it('creates single installment row when buyer pays full total upfront during partial checkout', async () => {
    await service.createWithOrder(
      {
        order: {
          storeId,
          isPartialPayment: true,
          installmentIntervalValue: 7,
          installmentIntervalUnit: InstallmentPeriod.DAYS,
          items: [{ itemId, quantity: 1 }],
        },
        payment: {
          amount: 30,
          currency: 'USD',
          paymentMethod: 'TRANSFER',
          reference: 'TR-100',
          storeId,
        },
      },
      userId,
    );

    expect(savedEntities.installments).toHaveLength(1);
    expect(savedEntities.installments[0].amount).toBe(30);
    expect(savedEntities.payments).toHaveLength(1);
  });

  it('rejects $0.00 payment for cash order or store requiring upfront initial > 0%', async () => {
    await expect(
      service.createWithOrder(
        {
          order: { storeId, isPartialPayment: false, items: [{ itemId, quantity: 1 }] },
          payment: { amount: 0, currency: 'USD', storeId },
        },
        userId,
      ),
    ).rejects.toThrow(BadRequestException);

    baseStore.minInitialPaymentPercentage = 20;
    await expect(
      service.createWithOrder(
        {
          order: {
            storeId,
            isPartialPayment: true,
            installmentIntervalValue: 7,
            installmentIntervalUnit: InstallmentPeriod.DAYS,
            items: [{ itemId, quantity: 1 }],
          },
          payment: { amount: 0, currency: 'USD', storeId },
        },
        userId,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('blocks partial purchase when buyer has no identification, exceeds maxCreditLimit, or item disallows installments', async () => {
    baseUser.identification = '';
    await expect(
      service.createWithOrder(
        {
          order: {
            storeId,
            isPartialPayment: true,
            installmentIntervalValue: 7,
            installmentIntervalUnit: InstallmentPeriod.DAYS,
            items: [{ itemId, quantity: 1 }],
          },
          payment: { amount: 0, currency: 'USD', storeId },
        },
        userId,
      ),
    ).rejects.toThrow(BadRequestException);

    baseUser.identification = 'V-12345678';
    mockActiveDebtOrders = [{ remainingBalance: 35 }]; // + $30 > $50 maxCreditLimit
    await expect(
      service.createWithOrder(
        {
          order: {
            storeId,
            isPartialPayment: true,
            installmentIntervalValue: 7,
            installmentIntervalUnit: InstallmentPeriod.DAYS,
            items: [{ itemId, quantity: 1 }],
          },
          payment: { amount: 0, currency: 'USD', storeId },
        },
        userId,
      ),
    ).rejects.toThrow(BadRequestException);

    mockActiveDebtOrders = [];
    baseItem.allowInstallments = false;
    await expect(
      service.createWithOrder(
        {
          order: {
            storeId,
            isPartialPayment: true,
            installmentIntervalValue: 7,
            installmentIntervalUnit: InstallmentPeriod.DAYS,
            items: [{ itemId, quantity: 1 }],
          },
          payment: { amount: 0, currency: 'USD', storeId },
        },
        userId,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('handles PRE_ORDER FREE, PERCENTAGE, FIXED_AMOUNT, FULL_PAYMENT and quota exhaustion without requiring store installments', async () => {
    baseStore.allowPartialPayments = false;
    baseItem.bookingType = BookingType.PRE_ORDER;
    mockPreorderConfig = {
      id: 'pre-1',
      itemId,
      depositType: DepositType.FREE,
      depositValue: 0,
      maxPreOrderUnits: 10,
      reservedPreOrderUnits: 5,
    };

    const freeRes: any = await service.createWithOrder(
      {
        order: { storeId, isPartialPayment: false, items: [{ itemId, quantity: 2 }] },
        payment: { amount: 0, currency: 'USD', storeId },
      },
      userId,
    );

    expect(freeRes.status).toBe(PaymentStatus.APPROVED);
    expect(freeRes.amount).toBe(0);
    expect(savedEntities.orders[0].preOrderStatus).toBe(PreOrderStatus.AWAITING_STOCK);
    expect(mockPreorderConfig.reservedPreOrderUnits).toBe(7);

    // Exhausted quota
    await expect(
      service.createWithOrder(
        {
          order: { storeId, isPartialPayment: false, items: [{ itemId, quantity: 5 }] },
          payment: { amount: 0, currency: 'USD', storeId },
        },
        userId,
      ),
    ).rejects.toThrow(BadRequestException);

    // PERCENTAGE deposit (10% of $30 = $3.00)
    mockPreorderConfig.depositType = DepositType.PERCENTAGE;
    mockPreorderConfig.depositValue = 10;
    await expect(
      service.createWithOrder(
        {
          order: { storeId, isPartialPayment: false, items: [{ itemId, quantity: 1 }] },
          payment: { amount: 2, currency: 'USD', paymentMethod: 'PAGO_MOVIL', reference: 'REF1', storeId },
        },
        userId,
      ),
    ).rejects.toThrow(BadRequestException);

    await service.createWithOrder(
      {
        order: { storeId, isPartialPayment: false, items: [{ itemId, quantity: 1 }] },
        payment: { amount: 3, currency: 'USD', paymentMethod: 'PAGO_MOVIL', reference: 'REF2', storeId },
      },
      userId,
    );
    expect(savedEntities.payments).toHaveLength(1);

    // FIXED_AMOUNT deposit ($12 per unit)
    mockPreorderConfig.depositType = DepositType.FIXED_AMOUNT;
    mockPreorderConfig.depositValue = 12;
    await service.createWithOrder(
      {
        order: { storeId, isPartialPayment: false, items: [{ itemId, quantity: 1 }] },
        payment: { amount: 12, currency: 'USD', paymentMethod: 'PAGO_MOVIL', reference: 'REF3', storeId },
      },
      userId,
    );

    // FULL_PAYMENT deposit ($30)
    mockPreorderConfig.depositType = DepositType.FULL_PAYMENT;
    await expect(
      service.createWithOrder(
        {
          order: { storeId, isPartialPayment: false, items: [{ itemId, quantity: 1 }] },
          payment: { amount: 15, currency: 'USD', paymentMethod: 'PAGO_MOVIL', reference: 'REF4', storeId },
        },
        userId,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('assigns residual cent on the final installment for uneven division (e.g. $10.00 / 3)', () => {
    const schedule = buildInstallmentScheduleRows({
      finalAmount: 10,
      commAmount: 1,
      upfrontAmount: 0,
      maxInstallments: 4, // 1 upfront $0 + 3 future installments
      now: new Date('2026-11-12T10:00:00Z'),
      intervalValue: 7,
      intervalUnit: InstallmentPeriod.DAYS,
    });

    expect(schedule.rows.map((r) => r.amount)).toEqual([0, 3.33, 3.33, 3.34]);
    const totalAmount = schedule.rows.reduce((s, r) => s + r.amount, 0);
    const totalComm = schedule.rows.reduce(
      (s, r) => s + r.platformCommissionPortion,
      0,
    );
    expect(Math.round(totalAmount * 100) / 100).toBe(10);
    expect(Math.round(totalComm * 100) / 100).toBe(1);
    expect(schedule.rows[0].platformCommissionPortion).toBe(0);
    expect(schedule.rows[1].dueDate).toBeInstanceOf(Date);
    expect(schedule.rows[2].dueDate).toBeNull();
  });

  it('verifyPayment validates Cuota 2 amount against nextPending when Cuota 1 was $0.00 deferred and accrues stored commission portion', async () => {
    const inst1: any = {
      id: 'inst-1',
      amount: 0,
      paidAmount: 0,
      lateFeeApplied: 0,
      platformCommissionPortion: 0,
      dueDate: new Date('2026-11-12T10:00:00Z'),
      paymentDate: new Date('2026-11-12T10:00:00Z'),
      status: InstallmentStatus.PAID,
    };
    const inst2: any = {
      id: 'inst-2',
      amount: 15,
      paidAmount: 0,
      lateFeeApplied: 0,
      platformCommissionPortion: 1.5,
      dueDate: new Date('2026-11-19T10:00:00Z'),
      status: InstallmentStatus.PENDING,
    };
    const inst3: any = {
      id: 'inst-3',
      amount: 15,
      paidAmount: 0,
      lateFeeApplied: 0,
      platformCommissionPortion: 1.5,
      dueDate: null,
      status: InstallmentStatus.PENDING,
    };

    const storeObj: any = {
      id: storeId,
      name: 'Habla Cloro',
      minInitialPaymentPercentage: 0,
      maxInstallments: 3,
      accumulatedCommissionDebt: 0,
      owner: { id: 'owner-1' },
      company: null,
    };

    const orderObj: any = {
      id: 'ord-verify-1',
      status: OrderStatus.PARTIALLY_PAID,
      isPartialPayment: true,
      finalAmount: 30,
      balance: 30,
      remainingBalance: 30,
      totalPaidAmount: 0,
      platformCommissionAmount: 3,
      isCommissionVoided: false,
      installmentIntervalValue: 7,
      installmentIntervalUnit: InstallmentPeriod.DAYS,
      payments: [],
      user: { id: userId, email: 'u@test.com', firstName: 'E' },
    };

    const paymentObj: any = {
      id: 'pay-cuota-2',
      amount: 15,
      status: PaymentStatus.WAITING_VERIFICATION,
      order: orderObj,
      store: storeObj,
      user: orderObj.user,
    };
    orderObj.payments = [paymentObj];

    const vManager: any = {
      findOne: jest.fn().mockImplementation(async (entity: any) => {
        if (entity === Payment) return paymentObj;
        if (entity === Order) return orderObj;
        return null;
      }),
      find: jest.fn().mockImplementation(async (entity: any) => {
        if (entity === Installment) return [inst1, inst2, inst3];
        return [];
      }),
      save: jest.fn().mockImplementation(async (e: any) => e),
    };

    const vQr: any = {
      connect: jest.fn(),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
      manager: vManager,
    };

    const vService = new PaymentService(
      {} as any,
      { findOne: jest.fn().mockResolvedValue(null) } as any,
      {} as any,
      {} as any,
      { createQueryRunner: jest.fn().mockReturnValue(vQr) } as any,
      {
        create: jest.fn().mockResolvedValue(undefined),
        notifyCustomerInstallmentsUpdated: jest.fn(),
        notifyStoreInstallmentsUpdated: jest.fn(),
      } as any,
      {
        sendPaymentRejectedNotice: jest.fn().mockResolvedValue(undefined),
        sendInstallmentPaymentApproved: jest.fn().mockResolvedValue(undefined),
        sendPaymentApproved: jest.fn().mockResolvedValue(undefined),
      } as any,
      {} as any,
      { isFraudPenaltyEnabled: jest.fn().mockResolvedValue(false) } as any,
      { log: jest.fn() } as any,
    );

    // Reject if payment < $15 (even though minInitialPercentage is 0%)
    paymentObj.amount = 5;
    await expect(
      vService.verifyPayment('pay-cuota-2', PaymentStatus.APPROVED, 'owner-1'),
    ).rejects.toThrow(BadRequestException);

    // Succeed if payment == $15
    paymentObj.amount = 15;
    paymentObj.status = PaymentStatus.WAITING_VERIFICATION;
    await vService.verifyPayment('pay-cuota-2', PaymentStatus.APPROVED, 'owner-1');
    expect(inst2.status).toBe(InstallmentStatus.PAID);
    expect(inst3.dueDate).toBeInstanceOf(Date);
    expect(storeObj.accumulatedCommissionDebt).toBe(1.5);
  });
});
