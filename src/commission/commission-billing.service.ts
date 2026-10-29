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
import { NotificationService } from 'src/notification/notification.service';
import { User } from 'src/user/entities/user.entity';
import { SalesLedgerQueryDto } from './dto/sales-ledger-query.dto';

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
    private readonly notificationService: NotificationService,
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
    const store = await this.storeRepository.findOne({
      where: { id: storeId },
    });
    if (!store) throw new NotFoundException('Tienda no encontrada');
    store.isCommissionExempt = isExempt;
    return this.storeRepository.save(store);
  }

  async setStoreSuspension(storeId: string, suspend: boolean) {
    const store = await this.storeRepository.findOne({
      where: { id: storeId },
    });
    if (!store) throw new NotFoundException('Tienda no encontrada');
    store.status = suspend ? StoreStatus.SUSPENDED : StoreStatus.ACTIVE;
    const savedStore = await this.storeRepository.save(store);
    this.notificationService.notifyAdminBadgesChanged().catch(() => {});
    return savedStore;
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
    if (!billing)
      throw new NotFoundException('Facturación semanal no encontrada');

    const method = await this.platformPaymentMethodRepository.findOne({
      where: { id: dto.paymentMethodId },
    });
    if (!method)
      throw new NotFoundException(
        'Método de pago de la plataforma no encontrado',
      );

    const report = this.reportRepository.create({
      billing,
      amount: dto.amount,
      paymentMethod: method,
      referenceNumber: dto.referenceNumber,
      receiptImageUrl: dto.receiptImageUrl,
      status: PaymentReportStatus.PENDING_REVIEW,
    });
    const savedReport = await this.reportRepository.save(report);

    this.notificationService
      .notifyAdminActionRequired({
        type: 'COMMISSION_PAYMENT_PENDING',
        title: 'Pago de comisión reportado',
        message: `La tienda "${billing.store?.name || 'Comercio'}" reportó abono de deuda/comisión por $${Number(dto.amount).toFixed(2)} USD`,
        entityId: savedReport.id,
        link: '/store-debts',
        metadata: {
          reportId: savedReport.id,
          storeId: billing.store?.id,
          amount: dto.amount,
          referenceNumber: dto.referenceNumber,
        },
      })
      .catch(() => {});

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
      billing.paidAmount =
        parseFloat(billing.paidAmount?.toString() || '0') +
        parseFloat(report.amount.toString());
      if (billing.paidAmount >= parseFloat(billing.totalDue.toString())) {
        billing.status = BillingStatus.PAID;
      }
      await this.billingRepository.save(billing);

      // Descontar deuda de la tienda
      const currentDebt = parseFloat(
        store.accumulatedCommissionDebt?.toString() || '0',
      );
      const newDebt = Math.max(
        0,
        currentDebt - parseFloat(report.amount.toString()),
      );
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

    this.notificationService.notifyAdminBadgesChanged().catch(() => {});

    return report;
  }

  // ----------------------------------------------------
  // MÉTRICAS FINANCIERAS (ADMIN)
  // ----------------------------------------------------
  async getCommissionMetrics() {
    const now = new Date();
    const startOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );
    const startOfWeek = new Date(startOfToday);
    startOfWeek.setDate(
      startOfWeek.getDate() - ((startOfWeek.getDay() + 6) % 7),
    ); // Lunes
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);

    // 1. Comisiones Cobradas / Liquidadas (Facturas pagadas)
    const paidBillings = await this.billingRepository.find({
      where: { status: BillingStatus.PAID },
    });

    const calculateCollected = (fromDate: Date) =>
      paidBillings
        .filter((b) => new Date(b.createdAt) >= fromDate)
        .reduce((sum, b) => sum + parseFloat(b.commissionAmount.toString()), 0);

    const collected = {
      today: calculateCollected(startOfToday),
      thisWeek: calculateCollected(startOfWeek),
      thisMonth: calculateCollected(startOfMonth),
      thisYear: calculateCollected(startOfYear),
      totalHistorical: calculateCollected(new Date(0)),
    };

    // 2. Comisiones Pendientes por Cobrar (Deuda acumulada en tiendas + Facturas emitidas por cobrar)
    const storesWithDebt = await this.storeRepository
      .createQueryBuilder('store')
      .where('store.accumulatedCommissionDebt > 0')
      .select(['store.id', 'store.accumulatedCommissionDebt'])
      .getMany();

    const unbilledDebt = storesWithDebt.reduce(
      (sum, s) =>
        sum + parseFloat(s.accumulatedCommissionDebt?.toString() || '0'),
      0,
    );
    const pendingStoresCount = storesWithDebt.length;

    const pendingBillings = await this.billingRepository.find({
      where: {
        status: In([
          BillingStatus.PENDING,
          BillingStatus.OVERDUE,
          BillingStatus.PAYMENT_REPORTED,
          BillingStatus.SUSPENDED,
        ]),
      },
    });

    const billedPendingReview = pendingBillings.reduce(
      (sum, b) =>
        sum +
        Math.max(
          0,
          parseFloat(b.totalDue?.toString() || '0') -
            parseFloat(b.paidAmount?.toString() || '0'),
        ),
      0,
    );

    const totalReceivable = Math.round(unbilledDebt * 100) / 100;

    // 3. Volumen Bruto Transaccionado (GMV de órdenes no canceladas ni rechazadas)
    const validOrders = await this.orderRepository.find({
      where: {
        status: In([OrderStatus.FULLY_PAID, OrderStatus.PARTIALLY_PAID]),
        isCommissionVoided: false,
      },
      select: ['id', 'finalAmount', 'createdAt'],
    });

    const calculateGross = (fromDate: Date) =>
      validOrders
        .filter((o) => new Date(o.createdAt) >= fromDate)
        .reduce(
          (sum, o) => sum + parseFloat(o.finalAmount?.toString() || '0'),
          0,
        );

    const grossVolume = {
      today: calculateGross(startOfToday),
      thisWeek: calculateGross(startOfWeek),
      thisMonth: calculateGross(startOfMonth),
      totalHistorical: calculateGross(new Date(0)),
    };

    return {
      // Compatibilidad con contratos existentes en frontend
      today: collected.today,
      thisWeek: collected.thisWeek,
      thisMonth: collected.thisMonth,
      thisYear: collected.thisYear,
      totalHistorical: collected.totalHistorical,

      // Bloques detallados enriquecidos
      collected,
      pending: {
        unbilledDebt: Math.round(unbilledDebt * 100) / 100,
        billedPendingReview: Math.round(billedPendingReview * 100) / 100,
        totalReceivable,
        pendingStoresCount,
        pendingBillingsCount: pendingBillings.length,
      },
      grossVolume: {
        today: Math.round(grossVolume.today * 100) / 100,
        thisWeek: Math.round(grossVolume.thisWeek * 100) / 100,
        thisMonth: Math.round(grossVolume.thisMonth * 100) / 100,
        totalHistorical: Math.round(grossVolume.totalHistorical * 100) / 100,
      },
    };
  }

  // ----------------------------------------------------
  // HISTORIAL FINANCIERO DE VENTAS Y COMISIONES (ADMIN)
  // ----------------------------------------------------
  async getSalesLedger(query: SalesLedgerQueryDto) {
    const limit = query.limit ? Math.min(Math.max(query.limit, 1), 100) : 20;
    const offset = query.offset && query.offset >= 0 ? query.offset : 0;

    const now = new Date();
    let computedStart: Date | undefined;
    let computedEnd: Date | undefined;

    if (query.datePreset === 'today') {
      computedStart = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        0,
        0,
        0,
        0,
      );
      computedEnd = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        23,
        59,
        59,
        999,
      );
    } else if (query.datePreset === 'week') {
      const day = now.getDay();
      const diffToMonday = (day + 6) % 7;
      computedStart = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() - diffToMonday,
        0,
        0,
        0,
        0,
      );
      computedEnd = new Date(now);
    } else if (query.datePreset === 'month') {
      computedStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      computedEnd = new Date(now);
    } else if (query.datePreset === 'year') {
      computedStart = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
      computedEnd = new Date(now);
    } else if (query.startDate || query.endDate) {
      if (query.startDate) computedStart = new Date(query.startDate);
      if (query.endDate) {
        computedEnd = new Date(query.endDate);
        if (query.endDate.length <= 10) {
          computedEnd.setHours(23, 59, 59, 999);
        }
      }
    }

    const applyFilters = (qb: any) => {
      if (computedStart) {
        qb.andWhere('order.createdAt >= :computedStart', { computedStart });
      }
      if (computedEnd) {
        qb.andWhere('order.createdAt <= :computedEnd', { computedEnd });
      }
      if (query.companyId) {
        qb.andWhere('store.companyId = :companyId', {
          companyId: query.companyId,
        });
      }
      if (query.storeId) {
        qb.andWhere('store.id = :storeId', { storeId: query.storeId });
      }
      if (query.categoryId) {
        qb.andWhere('category.id = :categoryId', {
          categoryId: query.categoryId,
        });
      }
      if (query.subcategoryId) {
        qb.andWhere('subcategory.id = :subcategoryId', {
          subcategoryId: query.subcategoryId,
        });
      }
      if (query.status) {
        qb.andWhere('order.status = :orderStatus', {
          orderStatus: query.status,
        });
      }
      if (query.search && query.search.trim().length > 0) {
        const term = `%${query.search.trim()}%`;
        qb.andWhere(
          '(CAST(order.id AS TEXT) ILIKE :term OR store.name ILIKE :term OR company.name ILIKE :term OR item.title ILIKE :term OR user.firstName ILIKE :term OR user.lastName ILIKE :term OR user.email ILIKE :term)',
          { term },
        );
      }
    };

    // 1. Query para registros principales
    const qb = this.orderRepository
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.store', 'store')
      .leftJoinAndSelect('store.company', 'company')
      .leftJoinAndSelect('store.subcategory', 'subcategory')
      .leftJoinAndSelect('subcategory.category', 'category')
      .leftJoinAndSelect('order.user', 'user')
      .leftJoinAndSelect('order.orderItems', 'orderItems')
      .leftJoinAndSelect('orderItems.item', 'item')
      .leftJoinAndSelect('orderItems.variant', 'variant')
      .leftJoinAndSelect('order.payments', 'payments')
      .leftJoinAndSelect('order.slotBookings', 'slotBookings')
      .leftJoinAndSelect('slotBookings.timeSlot', 'timeSlot')
      .leftJoinAndSelect('timeSlot.slotConfig', 'slotConfig');

    applyFilters(qb);

    qb.orderBy('order.createdAt', 'DESC')
      .skip(offset)
      .take(limit);

    const [orders, total] = await qb.getManyAndCount();

    // 2. Query para resumen agregado con los mismos filtros
    const summaryQb = this.orderRepository
      .createQueryBuilder('order')
      .leftJoin('order.store', 'store')
      .leftJoin('store.company', 'company')
      .leftJoin('store.subcategory', 'subcategory')
      .leftJoin('subcategory.category', 'category')
      .leftJoin('order.user', 'user')
      .leftJoin('order.orderItems', 'orderItems')
      .leftJoin('orderItems.item', 'item');

    applyFilters(summaryQb);

    const rawSummary = await summaryQb
      .select('COALESCE(SUM(order.finalAmount), 0)', 'totalSalesAmount')
      .addSelect(
        'COALESCE(SUM(CASE WHEN order.isCommissionVoided = false THEN order.platformCommissionAmount ELSE 0 END), 0)',
        'totalCommissionAmount',
      )
      .addSelect('COUNT(DISTINCT order.id)', 'totalOrders')
      .getRawOne();

    // 3. Mapeo enriquecido de comisiones de cada orden
    const orderIds = orders.map((o) => o.id);
    const paidOrderIdsSet = new Set<string>();

    if (orderIds.length > 0) {
      const billings = await this.billingRepository.find({
        where: { status: BillingStatus.PAID },
        select: ['id', 'associatedOrderIds'],
      });
      for (const b of billings) {
        if (Array.isArray(b.associatedOrderIds)) {
          for (const oid of b.associatedOrderIds) {
            paidOrderIdsSet.add(oid);
          }
        }
      }
    }

    const items = orders.map((order) => {
      let commissionStatus: 'COLLECTED' | 'PENDING' | 'EXEMPT' | 'VOIDED';

      if (order.isCommissionVoided) {
        commissionStatus = 'VOIDED';
      } else if (
        order.store?.isCommissionExempt ||
        parseFloat(order.platformCommissionRate?.toString() || '0') === 0
      ) {
        commissionStatus = 'EXEMPT';
      } else if (paidOrderIdsSet.has(order.id)) {
        commissionStatus = 'COLLECTED';
      } else {
        commissionStatus = 'PENDING';
      }

      const orderItems = (order.orderItems || []).map((oi) => ({
        id: oi.id,
        title: oi.title,
        quantity: oi.quantity,
        price: parseFloat(oi.price?.toString() || '0'),
        variantLabel: oi.variantLabel || null,
        variantId: oi.variantId || null,
        selectedOptions: oi.selectedOptions || null,
        itemType: oi.item?.itemType || 'PRODUCT',
        bookingType: oi.item?.bookingType || 'NONE',
        requiresBooking: Boolean(oi.item?.requiresBooking),
        variant: oi.variant
          ? {
              id: oi.variant.id,
              sku: oi.variant.sku || null,
              axisValues: oi.variant.axisValues || {},
              imageUrl: oi.variant.imageUrl || null,
              price: oi.variant.price
                ? parseFloat(oi.variant.price.toString())
                : null,
            }
          : null,
        image:
          oi.variant?.imageUrl ||
          oi.item?.mainImage ||
          (Array.isArray(oi.item?.images) && oi.item.images[0]
            ? oi.item.images[0]
            : null),
      }));

      const primaryItem = orderItems[0] || null;
      const totalItemsCount = orderItems.reduce(
        (acc, curr) => acc + curr.quantity,
        0,
      );

      const slotBookings = (order.slotBookings || []).map((sb) => ({
        id: sb.id,
        bookingDate: sb.bookingDate,
        slotStartTime: sb.slotStartTime,
        slotEndTime: sb.slotEndTime,
        slotLabel: sb.slotLabel,
        status: sb.status,
        serviceDurationMinutes:
          sb.timeSlot?.slotConfig?.serviceDurationMinutes || 60,
        serviceLocationType:
          sb.timeSlot?.slotConfig?.serviceLocationType || 'ON_SITE',
      }));

      return {
        id: order.id,
        orderNumber: order.id.slice(0, 8).toUpperCase(),
        createdAt: order.createdAt,
        status: order.status,
        isPartialPayment: order.isPartialPayment,
        preOrderStatus: order.preOrderStatus || 'NONE',
        settlementDeadline: order.settlementDeadline || null,
        totalAmount: parseFloat(order.totalAmount?.toString() || '0'),
        feeAmount: parseFloat(order.feeAmount?.toString() || '0'),
        finalAmount: parseFloat(order.finalAmount?.toString() || '0'),
        platformCommissionRate: parseFloat(
          order.platformCommissionRate?.toString() || '0',
        ),
        platformCommissionAmount: parseFloat(
          order.platformCommissionAmount?.toString() || '0',
        ),
        isCommissionVoided: order.isCommissionVoided,
        commissionStatus,
        slotBookings,
        store: order.store
          ? {
              id: order.store.id,
              name: order.store.name,
              logo: order.store.logo,
              rif: order.store.rif,
              isCommissionExempt: order.store.isCommissionExempt,
              company: order.store.company
                ? {
                    id: order.store.company.id,
                    name: order.store.company.name,
                    logo: order.store.company.logo,
                    rif: order.store.company.rif,
                  }
                : null,
              subcategory: order.store.subcategory
                ? {
                    id: order.store.subcategory.id,
                    name: order.store.subcategory.name,
                    category: order.store.subcategory.category
                      ? {
                          id: order.store.subcategory.category.id,
                          name: order.store.subcategory.category.name,
                        }
                      : null,
                  }
                : null,
            }
          : null,
        user: order.user
          ? {
              id: order.user.id,
              firstName: order.user.firstName,
              lastName: order.user.lastName,
              email: order.user.email,
            }
          : null,
        orderItems,
        primaryItem,
        totalItemsCount,
        payments: (order.payments || []).map((p) => ({
          id: p.id,
          amount: parseFloat(p.amount?.toString() || '0'),
          currency: p.currency,
          status: p.status,
          reference: p.reference,
          paymentMethod: p.paymentMethod,
          receiptImage: p.receiptImage,
          createdAt: p.createdAt,
        })),
      };
    });

    return {
      items,
      total,
      limit,
      offset,
      summary: {
        totalSalesAmount:
          Math.round(parseFloat(rawSummary?.totalSalesAmount || '0') * 100) /
          100,
        totalCommissionAmount:
          Math.round(
            parseFloat(rawSummary?.totalCommissionAmount || '0') * 100,
          ) / 100,
        totalOrders: parseInt(rawSummary?.totalOrders || '0', 10),
      },
    };
  }
}
