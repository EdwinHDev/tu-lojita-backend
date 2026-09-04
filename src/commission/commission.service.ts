import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual, MoreThanOrEqual, IsNull, EntityManager } from 'typeorm';
import { CommissionConfigRange } from './entities/commission-config-range.entity';
import { CommissionSettings } from './entities/commission-settings.entity';
import { StoreCommissionBilling } from './entities/store-commission-billing.entity';
import { Store } from 'src/store/entities/store.entity';
import { Order } from 'src/order/entities/order.entity';
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
      const max = r.maxAmount !== null && r.maxAmount !== undefined ? parseFloat(r.maxAmount.toString()) : Infinity;
      return subtotalOrFinal >= min && subtotalOrFinal <= max;
    });

    if (!matchedRange) {
      return { rate: 0, commissionAmount: 0 };
    }

    const rate = isPartialPayment
      ? parseFloat(matchedRange.installmentPaymentRate.toString())
      : parseFloat(matchedRange.singlePaymentRate.toString());

    const commissionAmount = Math.round(((subtotalOrFinal * rate) / 100) * 100) / 100;
    return { rate, commissionAmount };
  }

  async voidOrderCommission(order: Order, manager?: EntityManager): Promise<void> {
    const commission = parseFloat(order.platformCommissionAmount?.toString() || '0');
    if (commission <= 0 || order.isCommissionVoided) {
      return;
    }

    const repo = manager ? manager.getRepository(Order) : null;
    if (repo) {
      await repo.update(order.id, { isCommissionVoided: true });
    } else {
      order.isCommissionVoided = true;
    }

    const storeRepo = manager ? manager.getRepository(Store) : this.storeRepository;
    const store = await storeRepo.findOne({ where: { id: order.store.id } });
    if (store) {
      const currentDebt = parseFloat(store.accumulatedCommissionDebt?.toString() || '0');
      const newDebt = Math.max(0, currentDebt - commission);
      await storeRepo.update(store.id, { accumulatedCommissionDebt: newDebt });
    }

    // Si existe una factura de corte pendiente para esa tienda, descontarlo
    const billingRepo = manager ? manager.getRepository(StoreCommissionBilling) : this.billingRepository;
    const pendingBilling = await billingRepo.findOne({
      where: {
        store: { id: order.store.id },
        status: BillingStatus.PENDING,
      },
    });

    if (pendingBilling) {
      const bCommission = parseFloat(pendingBilling.commissionAmount.toString());
      const bDue = parseFloat(pendingBilling.totalDue.toString());
      const updatedComm = Math.max(0, bCommission - commission);
      const updatedDue = Math.max(0, bDue - commission);
      await billingRepo.update(pendingBilling.id, {
        commissionAmount: updatedComm,
        totalDue: updatedDue,
      });
    }

    this.logger.log(`Voided commission of $${commission} for cancelled order ${order.id}`);
  }
}
