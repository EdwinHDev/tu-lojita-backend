jest.mock('@nestjs/common/utils/load-package.util', () => ({
  loadPackage: (pkg: string) => require(pkg),
}));
jest.mock('@nestjs/typeorm', () => ({
  InjectRepository: () => () => {},
}));
jest.mock('@nestjs/mapped-types', () => ({
  PartialType: (cls: any) => cls,
}));

import 'reflect-metadata';
import { ForbiddenException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { OrderPaginationDto } from './dto/order-pagination.dto';
import { OrderService } from './order.service';
import { OrderController } from './order.controller';
import { UserRole } from 'src/user/types/user-role.enum';
import { PaymentStatus } from 'src/payment/types/payment-status.enum';
import { CompanyPermission } from 'src/company/types/company-permission.enum';

function createOrderQbMock(resultItems: any[] = [], total = 0) {
  const andWhereCalls: Array<{ sql: string; params?: Record<string, any> }> =
    [];
  const qb: any = {
    leftJoinAndSelect: jest.fn(() => qb),
    andWhere: jest.fn((sql: string, params?: Record<string, any>) => {
      andWhereCalls.push({ sql, params });
      return qb;
    }),
    orderBy: jest.fn(() => qb),
    addOrderBy: jest.fn(() => qb),
    skip: jest.fn(() => qb),
    take: jest.fn(() => qb),
    getManyAndCount: jest.fn(async () => [resultItems, total]),
  };
  return { qb, andWhereCalls };
}

describe('OrderService & OrderController - Filters, Security & Privacy', () => {
  const makeOrder = (overrides: Record<string, any> = {}) => ({
    id: 'order-1',
    status: 'PENDING',
    totalAmount: 100,
    feeAmount: 5,
    finalAmount: 105,
    totalPaidAmount: 50,
    balance: 55,
    platformCommissionRate: 5,
    platformCommissionAmount: 5,
    store: {
      id: 'store-1',
      name: 'Tu Lojita Centro',
      owner: { id: 'owner-1' },
      company: {
        id: 'company-1',
        owner: { id: 'owner-1' },
      },
    },
    user: {
      id: 'buyer-1',
      firstName: 'María',
      lastName: 'González',
      email: 'maria@example.com',
      phone: '+584121234567',
      identification: 'V-12345678',
      addresses: [{ id: 'addr-1', street: 'Av. Principal' }],
      avatarUrl: 'https://cdn.example.com/maria.png',
    },
    orderItems: [
      {
        id: 'oi-1',
        title: 'Zapatos',
        quantity: 1,
        price: 100,
        basePrice: 95,
        commissionRate: 5,
        commissionAmount: 5,
        item: {
          id: 'item-1',
          price: 100,
          basePrice: 95,
          commissionRate: 5,
          commissionAmount: 5,
        },
      },
    ],
    ...overrides,
  });

  function setupOrderService({
    findOneOrder = makeOrder(),
    findAllItems = [makeOrder()],
  }: {
    findOneOrder?: any;
    findAllItems?: any[];
  } = {}) {
    const qbMock = createOrderQbMock(findAllItems, findAllItems.length);
    const orderRepository = {
      findOne: jest.fn(async () => findOneOrder),
      createQueryBuilder: jest.fn(() => qbMock.qb),
    };
    const itemRepository = {
      find: jest.fn(async () => []),
    };

    const service = new OrderService(
      orderRepository as any,
      {} as any,
      itemRepository as any,
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

    return { service, orderRepository, qbMock };
  }

  it('transforms hasPendingPayment boolean string query parameters accurately', () => {
    const dtoTrue = plainToInstance(OrderPaginationDto, {
      hasPendingPayment: 'true',
    });
    const dtoFalse = plainToInstance(OrderPaginationDto, {
      hasPendingPayment: 'false',
    });

    expect(dtoTrue.hasPendingPayment).toBe(true);
    expect(dtoFalse.hasPendingPayment).toBe(false);
  });

  it('applies hasPendingPayment EXISTS filter and extended search (customer name + payment reference) in findAll', async () => {
    const { service, qbMock } = setupOrderService();

    await service.findAll(
      {
        storeId: 'store-1',
        hasPendingPayment: true,
        search: 'REF-9988',
        limit: 10,
        offset: 0,
      },
      { id: 'owner-1', role: UserRole.COMPANY, company: { id: 'company-1' } } as any,
    );

    const hasPendingClause = qbMock.andWhereCalls.find((c) =>
      c.sql.includes('EXISTS (SELECT 1 FROM payments pp'),
    );
    expect(hasPendingClause).toBeDefined();
    expect(hasPendingClause!.params).toEqual({
      pendingPaymentStatus: PaymentStatus.WAITING_VERIFICATION,
    });

    const searchClause = qbMock.andWhereCalls.find((c) =>
      c.sql.includes('sp.reference ILIKE :search'),
    );
    expect(searchClause).toBeDefined();
    expect(searchClause!.sql).toContain('user.firstName ILIKE :search');
    expect(searchClause!.sql).toContain('user.lastName ILIKE :search');
    expect(searchClause!.sql).toContain("CONCAT(COALESCE(user.firstName, ''), ' ', COALESCE(user.lastName, '')) ILIKE :search");
    expect(searchClause!.params).toEqual({ search: '%REF-9988%' });
  });

  it('enforces tenant and collaborator branch authorization in findOne', async () => {
    const { service } = setupOrderService();

    // Unassigned branch collaborator -> ForbiddenException
    await expect(
      service.findOne('order-1', {
        id: 'collab-1',
        role: UserRole.COMPANY,
        isCollaborator: true,
        company: { id: 'company-1' },
        hasFullBranchAccess: false,
        allowedBranchIds: ['store-other'],
      }),
    ).rejects.toThrow(ForbiddenException);

    // Cross-company collaborator -> ForbiddenException
    await expect(
      service.findOne('order-1', {
        id: 'collab-2',
        role: UserRole.COMPANY,
        isCollaborator: true,
        company: { id: 'company-2' },
        hasFullBranchAccess: true,
      }),
    ).rejects.toThrow(ForbiddenException);

    // Unrelated user -> ForbiddenException
    await expect(
      service.findOne('order-1', {
        id: 'random-user',
        role: UserRole.USER,
      }),
    ).rejects.toThrow(ForbiddenException);

    // Authorized branch collaborator succeeds
    const allowedResult = await service.findOne('order-1', {
      id: 'collab-ok',
      role: UserRole.COMPANY,
      isCollaborator: true,
      company: { id: 'company-1' },
      hasFullBranchAccess: false,
      allowedBranchIds: ['store-1'],
    });
    expect(allowedResult.id).toBe('order-1');
  });

  it('masks customer PII and strips commission breakdown in OrderController for restricted collaborators', async () => {
    const order = makeOrder();
    const mockOrderService = {
      findAll: jest.fn(async () => ({
        items: [order],
        total: 1,
        limit: 10,
        offset: 0,
      })),
      findOne: jest.fn(async () => order),
    };
    const controller = new OrderController(mockOrderService as any);

    const restrictedCollab: any = {
      id: 'collab-ops',
      role: UserRole.COMPANY,
      isCollaborator: true,
      company: { id: 'company-1' },
      hasFullBranchAccess: true,
      permissions: [CompanyPermission.ORDERS_VIEW],
    };

    const single = await controller.findOne('order-1', restrictedCollab);
    expect(mockOrderService.findOne).toHaveBeenCalledWith(
      'order-1',
      restrictedCollab,
    );
    expect(single.user).toEqual(
      expect.objectContaining({
        id: 'buyer-1',
        firstName: 'María',
        lastName: 'González',
        email: null,
        phone: null,
        addresses: [],
        identification: null,
      }),
    );
    expect(single.platformCommissionRate).toBe(0);
    expect(single.platformCommissionAmount).toBe(0);
    expect(single.totalAmount).toBe(100);
    expect(single.feeAmount).toBe(5);
    expect(single.finalAmount).toBe(105);
    expect(single.balance).toBe(55);
    expect(single.orderItems[0].commissionRate).toBe(0);
    expect(single.orderItems[0].commissionAmount).toBe(0);
    expect(single.orderItems[0].basePrice).toBe(100);
    expect(single.orderItems[0].item.commissionAmount).toBe(0);

    const list = await controller.findAll({}, restrictedCollab);
    expect(list.items[0].user.email).toBeNull();
    expect(list.items[0].platformCommissionAmount).toBe(0);

    // Collaborator WITH customer data & sensitive financial access preserves both
    const privilegedCollab: any = {
      id: 'collab-full',
      role: UserRole.COMPANY,
      isCollaborator: true,
      company: { id: 'company-1' },
      hasFullBranchAccess: true,
      permissions: [
        CompanyPermission.ORDERS_VIEW_CUSTOMER_DATA,
        CompanyPermission.FINANCES_VIEW_SENSITIVE,
      ],
    };

    const fullSingle = await controller.findOne('order-1', privilegedCollab);
    expect(fullSingle.user.email).toBe('maria@example.com');
    expect(fullSingle.user.phone).toBe('+584121234567');
    expect(fullSingle.platformCommissionAmount).toBe(5);
    expect(fullSingle.orderItems[0].commissionAmount).toBe(5);
    expect(fullSingle.orderItems[0].basePrice).toBe(95);
  });
});
