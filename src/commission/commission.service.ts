import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Repository,
  LessThanOrEqual,
  MoreThanOrEqual,
  IsNull,
  EntityManager,
} from 'typeorm';
import { CommissionConfigRange } from './entities/commission-config-range.entity';
import { CommissionSettings } from './entities/commission-settings.entity';
import { StoreCommissionBilling } from './entities/store-commission-billing.entity';
import { Store } from 'src/store/entities/store.entity';
import { Order } from 'src/order/entities/order.entity';
import { OrderStatus, InstallmentStatus } from 'src/order/types';
import { PaymentStatus } from 'src/payment/types/payment-status.enum';
import { BillingStatus } from './types';

@Injectable()
export class CommissionService {
  private readonly logger = new Logger(CommissionService.name);

  constructor(
    @InjectRepository(CommissionConfigRange)
    private readonly rangeRepository: Repository<CommissionConfigRange>,
    @InjectRepository(CommissionSettings)
    private readonly settingsRepository: Repository<CommissionSettings>,
    @InjectRepository(StoreCommissionBilling)
    private readonly billingRepository: Repository<StoreCommissionBilling>,
    @InjectRepository(Store)
    private readonly storeRepository: Repository<Store>,
  ) {}

  async getSettings(): Promise<CommissionSettings> {
    let settings = await this.settingsRepository.findOne({ where: {} });
    if (!settings) {
      settings = this.settingsRepository.create({
        isEnabled: false,
        gracePeriodDays: 3,
        fineValue: 10.0,
      });
      await this.settingsRepository.save(settings);
    }
    return settings;
  }

  async calculateCommission(
    subtotalOrFinal: number,
    isPartialPayment: boolean,
    store: Store,
  ): Promise<{ rate: number; commissionAmount: number }> {
    // 1. Si la tienda está exenta, no se cobra comisión
    if (store.isCommissionExempt) {
      return { rate: 0, commissionAmount: 0 };
    }

    // 2. Verificar si las comisiones están habilitadas globalmente
    const settings = await this.getSettings();
    if (!settings.isEnabled) {
      return { rate: 0, commissionAmount: 0 };
    }

    // 3. Buscar el rango correspondiente al monto
    const ranges = await this.rangeRepository.find({
      where: { isActive: true },
      order: { minAmount: 'ASC' },
    });

    if (!ranges || ranges.length === 0) {
      return { rate: 0, commissionAmount: 0 };
    }

    // Buscar el tramo que coincida
    const matchedRange = ranges.find((r) => {
      const min = parseFloat(r.minAmount.toString());
      const max =
        r.maxAmount !== null && r.maxAmount !== undefined
          ? parseFloat(r.maxAmount.toString())
          : Infinity;
      return subtotalOrFinal >= min && subtotalOrFinal <= max;
    });

    if (!matchedRange) {
      return { rate: 0, commissionAmount: 0 };
    }

    const rate = isPartialPayment
      ? parseFloat(matchedRange.installmentPaymentRate.toString())
      : parseFloat(matchedRange.singlePaymentRate.toString());

    const commissionAmount =
      Math.round(((subtotalOrFinal * rate) / 100) * 100) / 100;
    return { rate, commissionAmount };
  }

  calculateAccruedOrderCommission(order: Order): number {
    const commAmount = parseFloat(
      order.platformCommissionAmount?.toString() || '0',
    );
    if (commAmount <= 0) {
      return 0;
    }

    const approvedPayments = (order.payments || []).filter(
      (p) => p.status === PaymentStatus.APPROVED,
    );
    const installments = order.installments || [];
    const paidInstallmentsCount = installments.filter(
      (inst) => inst.status === InstallmentStatus.PAID,
    ).length;

    if (!order.isPartialPayment) {
      const totalPaid = parseFloat(order.totalPaidAmount?.toString() || '0');
      if (
        approvedPayments.length > 0 ||
        order.isFullyPaid ||
        order.status === OrderStatus.FULLY_PAID ||
        totalPaid > 0
      ) {
        return commAmount;
      }
      return 0;
    }

    // Orden en cuotas (isPartialPayment === true)
    if (
      order.isFullyPaid ||
      order.status === OrderStatus.FULLY_PAID ||
      (installments.length > 0 && paidInstallmentsCount >= installments.length)
    ) {
      return commAmount;
    }

    if (installments.length > 0) {
      if (paidInstallmentsCount <= 0) {
        return 0;
      }
      const perInstComm =
        Math.round((commAmount / installments.length) * 100) / 100;
      return Math.min(
        commAmount,
        Math.round(perInstComm * paidInstallmentsCount * 100) / 100,
      );
    }

    if (approvedPayments.length <= 0) {
      return 0;
    }
    const maxInst = parseInt(
      order.store?.maxInstallments?.toString() || '1',
      10,
    );
    if (maxInst <= 1 || approvedPayments.length >= maxInst) {
      return commAmount;
    }
    const perInstComm = Math.round((commAmount / maxInst) * 100) / 100;
    return Math.min(
      commAmount,
      Math.round(perInstComm * approvedPayments.length * 100) / 100,
    );
  }

  async voidOrderCommission(
    order: Order,
    manager?: EntityManager,
  ): Promise<void> {
    const commission = parseFloat(
      order.platformCommissionAmount?.toString() || '0',
    );
    if (commission <= 0 || order.isCommissionVoided) {
      return;
    }

    const orderRepo = manager
      ? manager.getRepository(Order)
      : this.storeRepository.manager.getRepository(Order);

    const fullOrder =
      order.payments && order.installments
        ? order
        : await orderRepo.findOne({
            where: { id: order.id },
            relations: ['payments', 'installments', 'store'],
          });

    const accruedCommission = this.calculateAccruedOrderCommission(
      fullOrder || order,
    );

    await orderRepo.update(order.id, { isCommissionVoided: true });
    order.isCommissionVoided = true;

    if (accruedCommission <= 0) {
      this.logger.log(
        `Marked commission voided for unpaid order ${order.id} ($0.00 accrued to reverse)`,
      );
      return;
    }

    const storeId =
      order.store?.id ||
      fullOrder?.store?.id ||
      (order as any).storeId;
    if (!storeId) {
      this.logger.warn(
        `Cannot void commission for order ${order.id}: missing store relationship`,
      );
      return;
    }

    const storeRepo = manager
      ? manager.getRepository(Store)
      : this.storeRepository;
    const store = await storeRepo.findOne({ where: { id: storeId } });
    if (store) {
      const currentDebt = parseFloat(
        store.accumulatedCommissionDebt?.toString() || '0',
      );
      const newDebt =
        Math.round(Math.max(0, currentDebt - accruedCommission) * 100) / 100;
      await storeRepo.update(store.id, { accumulatedCommissionDebt: newDebt });
    }

    // Si existe una factura de corte pendiente para esa tienda, descontar lo efectivamente devengado
    const billingRepo = manager
      ? manager.getRepository(StoreCommissionBilling)
      : this.billingRepository;
    const pendingBilling = await billingRepo.findOne({
      where: {
        store: { id: storeId },
        status: BillingStatus.PENDING,
      },
    });

    if (pendingBilling) {
      const bCommission = parseFloat(
        pendingBilling.commissionAmount.toString(),
      );
      const bDue = parseFloat(pendingBilling.totalDue.toString());
      const updatedComm =
        Math.round(Math.max(0, bCommission - accruedCommission) * 100) / 100;
      const updatedDue =
        Math.round(Math.max(0, bDue - accruedCommission) * 100) / 100;
      await billingRepo.update(pendingBilling.id, {
        commissionAmount: updatedComm,
        totalDue: updatedDue,
      });
    }

    this.logger.log(
      `Voided accrued commission of $${accruedCommission} (of $${commission} total) for order ${order.id}`,
    );
  }
}
