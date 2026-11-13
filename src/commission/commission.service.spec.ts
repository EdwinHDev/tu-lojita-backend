jest.mock('@nestjs/common/utils/load-package.util', () => ({
  loadPackage: jest.fn(),
}));

jest.mock('@nestjs/typeorm', () => ({
  InjectRepository: () => () => undefined,
}));

import { CommissionService } from './commission.service';
import { InstallmentStatus, OrderStatus } from 'src/order/types';

describe('CommissionService.calculateAccruedOrderCommission', () => {
  const service = new CommissionService(
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  );

  it('accrues zero commission for $0.00 deferred Cuota 1 and accrues exact portions as Cuota 2+ are paid', () => {
    const baseOrder: any = {
      id: 'ord-1',
      isPartialPayment: true,
      isFullyPaid: false,
      status: OrderStatus.PARTIALLY_PAID,
      platformCommissionAmount: 3.0,
      payments: [],
      installments: [
        {
          id: 'inst-1',
          amount: 0,
          platformCommissionPortion: 0,
          status: InstallmentStatus.PAID,
        },
        {
          id: 'inst-2',
          amount: 15,
          platformCommissionPortion: 1.5,
          status: InstallmentStatus.PENDING,
        },
        {
          id: 'inst-3',
          amount: 15,
          platformCommissionPortion: 1.5,
          status: InstallmentStatus.PENDING,
        },
      ],
    };

    expect(service.calculateAccruedOrderCommission(baseOrder)).toBe(0);

    baseOrder.installments[1].status = InstallmentStatus.PAID;
    expect(service.calculateAccruedOrderCommission(baseOrder)).toBe(1.5);

    baseOrder.installments[2].status = InstallmentStatus.PAID;
    baseOrder.isFullyPaid = true;
    baseOrder.status = OrderStatus.FULLY_PAID;
    expect(service.calculateAccruedOrderCommission(baseOrder)).toBe(3);
  });
});
