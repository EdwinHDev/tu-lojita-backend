jest.mock('@nestjs/common/utils/load-package.util', () => ({
  loadPackage: (pkg: string) => require(pkg),
}));
jest.mock('@nestjs/typeorm', () => ({
  InjectRepository: () => () => {},
}));

import {
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { StoreService } from './store.service';
import { StoreStatus } from './types/status.enum';
import { UserRole } from 'src/user/types/user-role.enum';
import { StoreCommissionBilling } from 'src/commission/entities/store-commission-billing.entity';
import { CompanySubscription } from 'src/subscription/entities/company-subscription.entity';
import { SubscriptionStatus } from 'src/subscription/types';
import { StoreAutoDeletionCron } from './cron/store-auto-deletion.cron';

function createQbMock({ count = 0, many = [] as any[] } = {}) {
  const qb: any = {
    select: jest.fn(() => qb),
    addSelect: jest.fn(() => qb),
    innerJoin: jest.fn(() => qb),
    leftJoin: jest.fn(() => qb),
    where: jest.fn(() => qb),
    andWhere: jest.fn(() => qb),
    getCount: jest.fn(async () => count),
    getMany: jest.fn(async () => many),
  };
  return qb;
}

describe('StoreService & Cron - Branch Lifecycle Debt & Suspension Locks', () => {
  const ownerId = 'owner-1';
  const companyId = 'company-1';
  const storeId = 'store-1';

  const ownerUser: any = {
    id: ownerId,
    email: 'owner@tienda.com',
    firstName: 'María',
    lastName: 'Pérez',
    role: UserRole.USER,
  };

  const otherUser: any = {
    id: 'stranger-99',
    email: 'stranger@otro.com',
    role: UserRole.USER,
  };

  const makeStore = (overrides: Record<string, any> = {}) => ({
    id: storeId,
    name: 'Tienda Demo',
    branchName: 'Sede Centro',
    slug: 'tienda-demo-sede-centro',
    status: StoreStatus.ACTIVE,
    isDeleted: false,
    accumulatedCommissionDebt: 0,
    deletionScheduledAt: null,
    owner: { id: ownerId, email: ownerUser.email },
    company: {
      id: companyId,
      owner: { id: ownerId, email: ownerUser.email },
    },
    ...overrides,
  });

  function buildService(options?: {
    store?: any;
    pendingReportsCount?: number;
    siblingPendingReportsCount?: number;
    suspendedBillingCount?: number;
    unpaidBillingCount?: number;
    siblingUnpaidBillingCount?: number;
    companySuspendedBranches?: number;
    companyIndebtedBranches?: number;
    activeCompanyBranches?: number;
    subscriptions?: any[];
    activeOrdersCount?: number;
    openDisputesCount?: number;
    pendingInstallmentsCount?: number;
  }) {
    const store = options?.store ?? makeStore();

    const storeRepository = {
      findOne: jest.fn(async () => store),
      save: jest.fn(async (s) => ({ ...s })),
      count: jest.fn(async ({ where }: any) => {
        if (where?.accumulatedCommissionDebt !== undefined) {
          return options?.companyIndebtedBranches ?? 0;
        }
        if (where?.status === StoreStatus.SUSPENDED) {
          return options?.companySuspendedBranches ?? 0;
        }
        if (where?.status === StoreStatus.ACTIVE) {
          return options?.activeCompanyBranches ?? 1;
        }
        return 0;
      }),
    };

    const orderRepository = {
      count: jest.fn(async () => options?.activeOrdersCount ?? 0),
    };

    const disputeRepository = {
      createQueryBuilder: jest.fn(() =>
        createQbMock({ count: options?.openDisputesCount ?? 0 }),
      ),
    };

    const installmentRepository = {
      createQueryBuilder: jest.fn(() =>
        createQbMock({ count: options?.pendingInstallmentsCount ?? 0 }),
      ),
    };

    let reportQbCall = 0;
    const commissionPaymentReportRepository = {
      createQueryBuilder: jest.fn(() => {
        reportQbCall += 1;
        // 1st call: local pending reports; 2nd call: sibling pending reports
        const count =
          reportQbCall === 1
            ? (options?.pendingReportsCount ?? 0)
            : (options?.siblingPendingReportsCount ?? 0);
        return createQbMock({ count });
      }),
    };

    let billingQbCall = 0;
    const billingRepo = {
      createQueryBuilder: jest.fn(() => {
        billingQbCall += 1;
        // 1st: suspended billing count; 2nd: local unpaid billing count; 3rd: sibling unpaid billing count
        if (billingQbCall === 1) {
          return createQbMock({ count: options?.suspendedBillingCount ?? 0 });
        }
        if (billingQbCall === 2) {
          return createQbMock({ count: options?.unpaidBillingCount ?? 0 });
        }
        return createQbMock({ count: options?.siblingUnpaidBillingCount ?? 0 });
      }),
    };

    const subscriptionRepo = {
      createQueryBuilder: jest.fn(() =>
        createQbMock({ many: options?.subscriptions ?? [] }),
      ),
    };

    const dataSource = {
      getRepository: jest.fn((entity: any) => {
        if (entity === StoreCommissionBilling) return billingRepo;
        if (entity === CompanySubscription) return subscriptionRepo;
        return null;
      }),
    };

    const activityLogRepository = {
      create: jest.fn((v) => v),
      save: jest.fn(async (v) => v),
    };

    const otpRepository = {
      update: jest.fn(async () => ({})),
      create: jest.fn((v) => v),
      save: jest.fn(async (v) => v),
      findOne: jest.fn(async () => null),
    };

    const mailService = {
      sendBranchLifecycleOtpEmail: jest.fn(async () => undefined),
    };

    const service = new StoreService(
      storeRepository as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      orderRepository as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      otpRepository as any,
      activityLogRepository as any,
      installmentRepository as any,
      disputeRepository as any,
      {} as any,
      mailService as any,
      dataSource as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      commissionPaymentReportRepository as any,
    );

    return {
      service,
      storeRepository,
      activityLogRepository,
      mailService,
    };
  }

  describe('validateLifecyclePreflight & requestLifecycleOtp', () => {
    it('blocks SUSPENDED store even with zero orders, disputes, or installments', async () => {
      const { service } = buildService({
        store: makeStore({ status: StoreStatus.SUSPENDED }),
      });

      const res = await service.validateLifecyclePreflight(storeId, ownerUser);

      expect(res.canProceed).toBe(false);
      expect(res.details.isSuspended).toBe(true);
      expect(res.blockers.some((b) => b.toLowerCase().includes('suspendida'))).toBe(
        true,
      );
      await expect(
        service.requestLifecycleOtp(storeId, 'SCHEDULE_DELETION', ownerUser),
      ).rejects.toThrow(ConflictException);
    });

    it('blocks branch when accumulatedCommissionDebt > 0', async () => {
      const { service } = buildService({
        store: makeStore({
          status: StoreStatus.ACTIVE,
          accumulatedCommissionDebt: 18.5,
        }),
      });

      const res = await service.validateLifecyclePreflight(storeId, ownerUser);

      expect(res.canProceed).toBe(false);
      expect(res.details.hasFinancialLock).toBe(true);
      expect(res.blockers.some((b) => b.includes('18.50'))).toBe(true);
    });

    it('blocks clean branch when company sibling branch has unpaid debt or suspended subscription', async () => {
      const { service } = buildService({
        store: makeStore({ status: StoreStatus.ACTIVE, accumulatedCommissionDebt: 0 }),
        companyIndebtedBranches: 1,
        subscriptions: [
          {
            status: SubscriptionStatus.SUSPENDED,
            accumulatedDebt: 25,
          },
        ],
      });

      const res = await service.validateLifecyclePreflight(storeId, ownerUser);

      expect(res.canProceed).toBe(false);
      expect(res.blockers.length).toBeGreaterThanOrEqual(2);
    });

    it('blocks branch with PENDING_REVIEW payment report or OVERDUE billing', async () => {
      const { service } = buildService({
        store: makeStore({ status: StoreStatus.ACTIVE }),
        pendingReportsCount: 1,
        unpaidBillingCount: 1,
      });

      const res = await service.validateLifecyclePreflight(storeId, ownerUser);

      expect(res.canProceed).toBe(false);
      expect(res.blockers.length).toBeGreaterThanOrEqual(2);
    });

    it('allows debt-free non-suspended branch with zero operational blockers', async () => {
      const { service } = buildService({
        store: makeStore({ status: StoreStatus.ACTIVE }),
      });

      const res = await service.validateLifecyclePreflight(storeId, ownerUser);

      expect(res.canProceed).toBe(true);
      expect(res.blockers).toEqual([]);
    });
  });

  describe('executeDeactivateBranch & executeScheduleBranchDeletion', () => {
    it('rejects deactivation and never overwrites SUSPENDED status', async () => {
      const store = makeStore({ status: StoreStatus.SUSPENDED });
      const { service, storeRepository } = buildService({ store });

      await expect(
        service.executeDeactivateBranch(storeId, '123456', ownerUser),
      ).rejects.toThrow(ConflictException);
      expect(store.status).toBe(StoreStatus.SUSPENDED);
      expect(storeRepository.save).not.toHaveBeenCalled();
    });

    it('rejects scheduling deletion on indebted branch even if active', async () => {
      const store = makeStore({
        status: StoreStatus.ACTIVE,
        accumulatedCommissionDebt: 10,
      });
      const { service, storeRepository } = buildService({ store });

      await expect(
        service.executeScheduleBranchDeletion(storeId, '123456', ownerUser),
      ).rejects.toThrow(ConflictException);
      expect(store.deletionScheduledAt).toBeNull();
      expect(storeRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('executeCancelScheduledDeletion', () => {
    it('clears deletionScheduledAt and keeps SUSPENDED when store is SUSPENDED', async () => {
      const scheduled = new Date(Date.now() + 86400000 * 5);
      const store = makeStore({
        status: StoreStatus.SUSPENDED,
        deletionScheduledAt: scheduled,
      });
      const { service } = buildService({ store });

      const updated = await service.executeCancelScheduledDeletion(
        storeId,
        ownerUser,
      );

      expect(updated.deletionScheduledAt).toBeNull();
      expect(updated.status).toBe(StoreStatus.SUSPENDED);
    });

    it('restores SUSPENDED (never ACTIVE) on legacy poisoned INACTIVE row that has unpaid commission debt or suspended billing', async () => {
      const scheduled = new Date(Date.now() + 86400000 * 3);
      const poisonedStore = makeStore({
        status: StoreStatus.INACTIVE,
        deletionScheduledAt: scheduled,
        accumulatedCommissionDebt: 42,
      });
      const { service } = buildService({
        store: poisonedStore,
        suspendedBillingCount: 1,
        unpaidBillingCount: 1,
      });

      const updated = await service.executeCancelScheduledDeletion(
        storeId,
        ownerUser,
      );

      expect(updated.deletionScheduledAt).toBeNull();
      expect(updated.status).toBe(StoreStatus.SUSPENDED);
    });

    it('restores ACTIVE when scheduled deletion is cancelled on a clean debt-free store', async () => {
      const scheduled = new Date(Date.now() + 86400000 * 3);
      const cleanStore = makeStore({
        status: StoreStatus.INACTIVE,
        deletionScheduledAt: scheduled,
        accumulatedCommissionDebt: 0,
      });
      const { service } = buildService({ store: cleanStore });

      const updated = await service.executeCancelScheduledDeletion(
        storeId,
        ownerUser,
      );

      expect(updated.deletionScheduledAt).toBeNull();
      expect(updated.status).toBe(StoreStatus.ACTIVE);
    });
  });

  describe('executeReactivateBranch', () => {
    it('forbids reactivating a SUSPENDED or indebted branch', async () => {
      const store = makeStore({
        status: StoreStatus.SUSPENDED,
        accumulatedCommissionDebt: 12,
      });
      const { service, storeRepository } = buildService({ store });

      await expect(
        service.executeReactivateBranch(storeId, ownerUser),
      ).rejects.toThrow(ForbiddenException);
      expect(storeRepository.save).not.toHaveBeenCalled();
    });

    it('reactivates a clean INACTIVE branch to ACTIVE', async () => {
      const store = makeStore({
        status: StoreStatus.INACTIVE,
        accumulatedCommissionDebt: 0,
      });
      const { service } = buildService({ store });

      const updated = await service.executeReactivateBranch(storeId, ownerUser);

      expect(updated.status).toBe(StoreStatus.ACTIVE);
      expect(updated.deletionScheduledAt).toBeNull();
    });
  });

  describe('StoreService.remove (DELETE /stores/:id)', () => {
    it('rejects non-owner user with ForbiddenException', async () => {
      const { service, storeRepository } = buildService({
        store: makeStore({ status: StoreStatus.ACTIVE }),
      });

      await expect(service.remove(storeId, otherUser)).rejects.toThrow(
        ForbiddenException,
      );
      expect(storeRepository.save).not.toHaveBeenCalled();
    });

    it('rejects deleting a SUSPENDED or indebted branch with ConflictException', async () => {
      const { service, storeRepository } = buildService({
        store: makeStore({
          status: StoreStatus.SUSPENDED,
          accumulatedCommissionDebt: 30,
        }),
      });

      await expect(service.remove(storeId, ownerUser)).rejects.toThrow(
        ConflictException,
      );
      expect(storeRepository.save).not.toHaveBeenCalled();
    });

    it('soft-deletes clean authorized branch with no blockers', async () => {
      const { service } = buildService({
        store: makeStore({ status: StoreStatus.ACTIVE }),
      });

      const deleted = await service.remove(storeId, ownerUser);

      expect(deleted.isDeleted).toBe(true);
      expect(deleted.status).toBe(StoreStatus.CLOSED);
    });
  });

  describe('StoreAutoDeletionCron & executeScheduledDeletionIfEligible', () => {
    it('aborts scheduled auto-deletion and restores SUSPENDED for an indebted/suspended expired branch', async () => {
      const pastDate = new Date(Date.now() - 3600 * 1000);
      const poisonedExpiredStore = makeStore({
        status: StoreStatus.INACTIVE,
        deletionScheduledAt: pastDate,
        accumulatedCommissionDebt: 55,
      });

      const { service } = buildService({ store: poisonedExpiredStore });

      const cronStoreRepo = {
        find: jest.fn(async () => [poisonedExpiredStore]),
      };
      const cron = new StoreAutoDeletionCron(
        cronStoreRepo as any,
        service,
      );

      await cron.handleScheduledStoreDeletions();

      expect(poisonedExpiredStore.isDeleted).toBe(false);
      expect(poisonedExpiredStore.deletionScheduledAt).toBeNull();
      expect(poisonedExpiredStore.status).toBe(StoreStatus.SUSPENDED);
    });

    it('soft-deletes clean expired branch', async () => {
      const pastDate = new Date(Date.now() - 3600 * 1000);
      const cleanExpiredStore = makeStore({
        status: StoreStatus.INACTIVE,
        deletionScheduledAt: pastDate,
        accumulatedCommissionDebt: 0,
      });

      const { service } = buildService({ store: cleanExpiredStore });
      const cronStoreRepo = {
        find: jest.fn(async () => [cleanExpiredStore]),
      };
      const cron = new StoreAutoDeletionCron(
        cronStoreRepo as any,
        service,
      );

      await cron.handleScheduledStoreDeletions();

      expect(cleanExpiredStore.isDeleted).toBe(true);
      expect(cleanExpiredStore.status).toBe(StoreStatus.CLOSED);
    });
  });
});
