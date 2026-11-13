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

import { OrderService } from './order.service';
import { OrderAutoCancellationCron } from './cron/order-auto-cancellation.cron';
import { StoreStatus } from 'src/store/types/status.enum';
import { InstallmentPeriod } from 'src/store/types/installment-period.enum';
import { ItemType } from 'src/item/types/item-type.enum';
import { BookingType } from 'src/item/types/booking-type.enum';
import { PreOrderStatus } from './types/preorder-status.enum';
import { OrderStatus } from './types';
import { ItemPreorderConfig } from 'src/item/entities/item-preorder-config.entity';
import { OrderSlotBooking } from './entities/order-slot-booking.entity';

describe('OrderService.validateCart & OrderAutoCancellationCron', () => {
  const storeId = 'e3726b99-c949-4fe3-9518-a3c96a5b0878';
  const userId = '11111111-1111-4111-8111-111111111111';
  const itemId = '747d3aa1-cf31-428d-8e25-d21f22e91f10';

  let orderService: OrderService;
  let mockStore: any;
  let mockUser: any;
  let mockItem: any;
  let mockActiveDebtOrders: any[];
  let mockOverdueInstallment: any;
  let mockRejectedOrder: any;

  beforeEach(() => {
    mockStore = {
      id: storeId,
      status: StoreStatus.ACTIVE,
      allowPartialPayments: true,
      partialPaymentsFeePercentage: 0,
      maxCreditLimit: 50,
      installmentFrequencyOptions: [
        { value: 7, unit: InstallmentPeriod.DAYS, label: 'Semanal' },
      ],
    };
    mockUser = {
      id: userId,
      identification: 'V-12345678',
    };
    mockItem = {
      id: itemId,
      title: 'Cloro 5L',
      price: 30,
      basePrice: 27,
      commissionAmount: 3,
      itemType: ItemType.PRODUCT,
      bookingType: BookingType.NONE,
      trackInventory: false,
      hasVariants: false,
      allowInstallments: true,
      isActive: true,
      isDeleted: false,
      store: { id: storeId },
      customizationGroupsRel: [],
    };
    mockActiveDebtOrders = [];
    mockOverdueInstallment = null;
    mockRejectedOrder = null;

    const installmentRepo = {
      findOne: jest.fn().mockImplementation(() => Promise.resolve(mockOverdueInstallment)),
    };

    const dataSource: any = {
      manager: {
        find: jest.fn().mockImplementation(() => Promise.resolve(mockActiveDebtOrders)),
      },
      getRepository: jest.fn().mockReturnValue(installmentRepo),
    };

    orderService = new OrderService(
      {
        findOne: jest.fn().mockImplementation(() => Promise.resolve(mockRejectedOrder)),
      } as any,
      { findOneBy: jest.fn().mockImplementation(() => Promise.resolve(mockStore)) } as any,
      { findOne: jest.fn().mockImplementation(() => Promise.resolve(mockItem)) } as any,
      {} as any,
      { findOneBy: jest.fn().mockImplementation(() => Promise.resolve(mockUser)) } as any,
      {} as any,
      {} as any,
      {} as any,
      dataSource,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
  });

  it('returns IDENTIFICATION_REQUIRED, ITEM_INSTALLMENTS_NOT_ALLOWED, and CREDIT_LIMIT_EXCEEDED from validateCart', async () => {
    mockUser.identification = '';
    mockItem.allowInstallments = false;
    mockActiveDebtOrders = [{ remainingBalance: 35 }]; // + $30 > $50

    const res = await orderService.validateCart(
      {
        storeId,
        isPartialPayment: true,
        installmentIntervalValue: 7,
        installmentIntervalUnit: InstallmentPeriod.DAYS,
        items: [{ itemId, quantity: 1 }],
      },
      userId,
    );

    expect(res.isValid).toBe(false);
    const codes = res.errors.map((e) => e.code);
    expect(codes).toContain('IDENTIFICATION_REQUIRED');
    expect(codes).toContain('ITEM_INSTALLMENTS_NOT_ALLOWED');
    expect(codes).toContain('CREDIT_LIMIT_EXCEEDED');
  });

  it('releases reservedPreOrderUnits on OrderAutoCancellationCron.handleAutoCancellations', async () => {
    const preorderConfig: any = {
      item: { id: itemId },
      reservedPreOrderUnits: 4,
    };

    const rejectedPreOrder: any = {
      id: 'ord-pre-1',
      status: OrderStatus.REJECTED,
      preOrderStatus: PreOrderStatus.AWAITING_STOCK,
      user: { id: userId, firstName: 'Ana', email: 'ana@test.com' },
      store: { id: storeId, name: 'Tienda Test' },
      payments: [],
      orderItems: [
        {
          quantity: 2,
          item: {
            id: itemId,
            trackInventory: false,
            bookingType: BookingType.PRE_ORDER,
          },
        },
      ],
    };

    const manager = {
      find: jest.fn().mockImplementation(async (entity: any) => {
        if (entity === OrderSlotBooking) return [];
        return [];
      }),
      findOne: jest.fn().mockImplementation(async (entity: any) => {
        if (entity === ItemPreorderConfig) return preorderConfig;
        return null;
      }),
      save: jest.fn().mockImplementation(async (e: any) => e),
    };

    const queryRunner = {
      connect: jest.fn().mockResolvedValue(undefined),
      startTransaction: jest.fn().mockResolvedValue(undefined),
      commitTransaction: jest.fn().mockResolvedValue(undefined),
      rollbackTransaction: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
      manager,
    };

    const cron = new OrderAutoCancellationCron(
      { find: jest.fn().mockResolvedValue([rejectedPreOrder]) } as any,
      {} as any,
      {} as any,
      { createQueryRunner: jest.fn().mockReturnValue(queryRunner) } as any,
      { create: jest.fn().mockResolvedValue(undefined), closeChatRoom: jest.fn() } as any,
      { sendOrderAutoCancelled: jest.fn().mockResolvedValue(undefined) } as any,
    );

    await cron.handleAutoCancellations();

    expect(preorderConfig.reservedPreOrderUnits).toBe(2);
    expect(rejectedPreOrder.preOrderStatus).toBe(PreOrderStatus.CANCELLED);
    expect(rejectedPreOrder.status).toBe(OrderStatus.CANCELLED);
    expect(queryRunner.commitTransaction).toHaveBeenCalledTimes(1);
  });
});
