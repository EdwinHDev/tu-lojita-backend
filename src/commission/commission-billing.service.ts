import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, LessThan, In } from 'typeorm';
import { StoreCommissionBilling } from './entities/store-commission-billing.entity';
import { CommissionPaymentReport } from './entities/commission-payment-report.entity';
import { CommissionConfigRange } from './entities/commission-config-range.entity';
import { CommissionSettings } from './entities/commission-settings.entity';
import { PlatformPaymentMethod } from './entities/platform-payment-method.entity';
import { Store } from 'src/store/entities/store.entity';
import { StoreStatus } from 'src/store/types/status.enum';
import { Order } from 'src/order/entities/order.entity';
import { OrderStatus } from 'src/order/types';
import { BillingStatus, PaymentReportStatus, FineType } from './types';
import { MailService } from 'src/common/mail/mail.service';
import { User } from 'src/user/entities/user.entity';

@Injectable()
export class StoreCommissionBillingService {
  private readonly logger = new Logger(StoreCommissionBillingService.name);

  constructor(
    @InjectRepository(StoreCommissionBilling)
    private readonly billingRepository: Repository<StoreCommissionBilling>,
    @InjectRepository(CommissionPaymentReport)
    private readonly reportRepository: Repository<CommissionPaymentReport>,
    @InjectRepository(CommissionConfigRange)
    private readonly rangeRepository: Repository<CommissionConfigRange>,
    @InjectRepository(CommissionSettings)
    private readonly settingsRepository: Repository<CommissionSettings>,
    @InjectRepository(PlatformPaymentMethod)
    private readonly platformPaymentMethodRepository: Repository<PlatformPaymentMethod>,
    @InjectRepository(Store)
    private readonly storeRepository: Repository<Store>,
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    private readonly mailService: MailService,
  ) {}

  // ----------------------------------------------------
  // GESTIÓN DE CONFIGURACIONES Y RANGOS (ADMIN)
  // ----------------------------------------------------
  async getSettingsAndRanges() {
    let settings = await this.settingsRepository.findOne({ where: {} });
    if (!settings) {
      settings = this.settingsRepository.create({
        isEnabled: false,
        gracePeriodDays: 3,
        fineValue: 10.0,
      });
      await this.settingsRepository.save(settings);
    }
    const ranges = await this.rangeRepository.find({
      order: { minAmount: 'ASC' },
    });
    return { settings, ranges };
  }

  async getActiveRanges() {
    const settings = await this.settingsRepository.findOne({ where: {} });
    const isEnabled = settings ? settings.isEnabled : false;
    const ranges = await this.rangeRepository.find({
      where: { isActive: true },
      order: { minAmount: 'ASC' },
    });
    return {
      isEnabled,
      ranges: ranges.map((r) => ({
        id: r.id,
        minAmount: parseFloat(r.minAmount.toString()),
        maxAmount:
          r.maxAmount !== null && r.maxAmount !== undefined
            ? parseFloat(r.maxAmount.toString())
            : null,
        singlePaymentRate: parseFloat(r.singlePaymentRate.toString()),
        installmentPaymentRate: parseFloat(r.installmentPaymentRate.toString()),
        isActive: r.isActive,
      })),
    };
  }

  async updateSettings(updateDto: Partial<CommissionSettings>) {
    let settings = await this.settingsRepository.findOne({ where: {} });
    if (!settings) {
      settings = this.settingsRepository.create(updateDto);
    } else {
      Object.assign(settings, updateDto);
    }
    return this.settingsRepository.save(settings);
  }

  async createRange(dto: Partial<CommissionConfigRange>) {
    const range = this.rangeRepository.create(dto);
    return this.rangeRepository.save(range);
  }

  async updateRange(id: string, dto: Partial<CommissionConfigRange>) {
    const range = await this.rangeRepository.findOne({ where: { id } });
    if (!range) throw new NotFoundException('Rango no encontrado');
    Object.assign(range, dto);
    return this.rangeRepository.save(range);
  }

  async deleteRange(id: string) {
    const range = await this.rangeRepository.findOne({ where: { id } });
    if (!range) throw new NotFoundException('Rango no encontrado');
    return this.rangeRepository.remove(range);
  }

  // ----------------------------------------------------
  // TIENDAS Y EXENCIONES (ADMIN)
  // ----------------------------------------------------
  async getStoresSummary() {
    return this.storeRepository.find({
      select: [
        'id',
        'name',
        'rif',
        'status',
        'isCommissionExempt',
        'accumulatedCommissionDebt',
      ],
      relations: ['owner'],
      order: { accumulatedCommissionDebt: 'DESC' },
    });
  }

  async toggleStoreExemption(storeId: string, isExempt: boolean) {
    const store = await this.storeRepository.findOne({ where: { id: storeId } });
    if (!store) throw new NotFoundException('Tienda no encontrada');
    store.isCommissionExempt = isExempt;
    return this.storeRepository.save(store);
  }

  async setStoreSuspension(storeId: string, suspend: boolean) {
    const store = await this.storeRepository.findOne({ where: { id: storeId } });
    if (!store) throw new NotFoundException('Tienda no encontrada');
    store.status = suspend ? StoreStatus.SUSPENDED : StoreStatus.ACTIVE;
    return this.storeRepository.save(store);
  }

  // ----------------------------------------------------
  // DEUDAS Y REPORTES PARA EL COMERCIO
  // ----------------------------------------------------
  async getStoreDebtHub(storeId: string) {
    const store = await this.storeRepository.findOne({
      where: { id: storeId },
    });
    if (!store) throw new NotFoundException('Tienda no encontrada');

    // Buscar facturación semanal pendiente o en mora
    const currentBilling = await this.billingRepository.findOne({
      where: {
        store: { id: storeId },
        status: In([
          BillingStatus.PENDING,
          BillingStatus.PAYMENT_REPORTED,
          BillingStatus.OVERDUE,
          BillingStatus.SUSPENDED,
        ]),
      },
      relations: ['paymentReports'],
      order: { createdAt: 'DESC' },
    });

    // Buscar órdenes recientes que generaron comisión
    const recentOrders = await this.orderRepository.find({
      where: {
        store: { id: storeId },
        isCommissionVoided: false,
      },
      select: [
        'id',
        'finalAmount',
        'platformCommissionRate',
        'platformCommissionAmount',
        'isPartialPayment',
        'status',
        'createdAt',
      ],
      order: { createdAt: 'DESC' },
      take: 50,
    });

    return {
      store: {
        id: store.id,
        name: store.name,
        status: store.status,
        accumulatedCommissionDebt: parseFloat(
          store.accumulatedCommissionDebt?.toString() || '0',
        ),
      },
      currentBilling,
      recentOrders,
    };
  }

  async reportCommissionPayment(
    storeId: string,
    billingId: string,
    dto: {
      amount: number;
      paymentMethodId: string;
      referenceNumber: string;
      receiptImageUrl: string;
    },
  ) {
    const billing = await this.billingRepository.findOne({
      where: { id: billingId, store: { id: storeId } },
    });
    if (!billing) throw new NotFoundException('Facturación semanal no encontrada');

    const method = await this.platformPaymentMethodRepository.findOne({
      where: { id: dto.paymentMethodId },
    });
    if (!method) throw new NotFoundException('Método de pago de la plataforma no encontrado');

    const report = this.reportRepository.create({
      billing,
      amount: dto.amount,
      paymentMethod: method,
      referenceNumber: dto.referenceNumber,
      receiptImageUrl: dto.receiptImageUrl,
      status: PaymentReportStatus.PENDING_REVIEW,
    });
    const savedReport = await this.reportRepository.save(report);

    billing.status = BillingStatus.PAYMENT_REPORTED;
    await this.billingRepository.save(billing);

    return savedReport;
  }

  // ----------------------------------------------------
  // CONCILIACIÓN DE REPORTES (ADMIN)
  // ----------------------------------------------------
  async reviewPaymentReport(
    reportId: string,
    action: { status: PaymentReportStatus; rejectionReason?: string },
    reviewer: User,
  ) {
    const report = await this.reportRepository.findOne({
      where: { id: reportId },
      relations: ['billing', 'billing.store', 'billing.store.owner'],
    });
    if (!report) throw new NotFoundException('Reporte de pago no encontrado');

    report.status = action.status;
    report.rejectionReason = action.rejectionReason || null;
    report.reviewedBy = reviewer;
    report.reviewedAt = new Date();
    await this.reportRepository.save(report);

    const billing = report.billing;
    const store = billing.store;

    if (action.status === PaymentReportStatus.APPROVED) {
      billing.paidAmount = parseFloat(billing.paidAmount?.toString() || '0') + parseFloat(report.amount.toString());
      if (billing.paidAmount >= parseFloat(billing.totalDue.toString())) {
        billing.status = BillingStatus.PAID;
      }
      await this.billingRepository.save(billing);

      // Descontar deuda de la tienda
      const currentDebt = parseFloat(store.accumulatedCommissionDebt?.toString() || '0');
      const newDebt = Math.max(0, currentDebt - parseFloat(report.amount.toString()));
      store.accumulatedCommissionDebt = newDebt;

      // Si estaba suspendida por mora, reactivarla
      if (store.status === StoreStatus.SUSPENDED && newDebt === 0) {
        store.status = StoreStatus.ACTIVE;
      }
      await this.storeRepository.save(store);
    } else {
      // Si fue rechazado, volver la factura a PENDING
      billing.status = BillingStatus.PENDING;
      await this.billingRepository.save(billing);
    }

    return report;
  }

  // ----------------------------------------------------
  // MÉTRICAS FINANCIERAS (ADMIN)
  // ----------------------------------------------------
  async getCommissionMetrics() {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(startOfToday);
    startOfWeek.setDate(startOfWeek.getDate() - ((startOfWeek.getDay() + 6) % 7)); // Lunes
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);

    const allBillings = await this.billingRepository.find({
      where: { status: BillingStatus.PAID },
    });

    const calculateTotal = (fromDate: Date) =>
      allBillings
        .filter((b) => new Date(b.createdAt) >= fromDate)
        .reduce((sum, b) => sum + parseFloat(b.commissionAmount.toString()), 0);

    return {
      today: calculateTotal(startOfToday),
      thisWeek: calculateTotal(startOfWeek),
      thisMonth: calculateTotal(startOfMonth),
      thisYear: calculateTotal(startOfYear),
      totalHistorical: calculateTotal(new Date(0)),
    };
  }
}
