import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, LessThan, MoreThan, In, Not } from 'typeorm';
import { StoreCommissionBilling } from './entities/store-commission-billing.entity';
import { CommissionPaymentReport } from './entities/commission-payment-report.entity';
import { CommissionConfigRange } from './entities/commission-config-range.entity';
import { CommissionSettings } from './entities/commission-settings.entity';
import { PlatformPaymentMethod } from './entities/platform-payment-method.entity';
import { Store } from 'src/store/entities/store.entity';
import { StoreStatus } from 'src/store/types/status.enum';
import { Order } from 'src/order/entities/order.entity';
import { OrderItem } from 'src/order-item/entities/order-item.entity';
import { OrderStatus } from 'src/order/types';
import { BillingStatus, PaymentReportStatus, FineType } from './types';
import { MailService } from 'src/common/mail/mail.service';
import { NotificationService } from 'src/notification/notification.service';
import { NotificationType } from 'src/notification/entities/notification.entity';
import { PlatformSettingsService } from 'src/platform-settings/platform-settings.service';
import { formatDualPrice } from 'src/common/utils/currency-format.utils';
import { resolveOrderItemImageUrl } from 'src/common/utils/order-item-image.utils';
import { User } from 'src/user/entities/user.entity';
import { UserRole } from 'src/user/types/user-role.enum';
import { SalesLedgerQueryDto } from './dto/sales-ledger-query.dto';
import { CommissionOrdersQueryDto } from './dto/commission-orders-query.dto';

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
    @Optional()
    private readonly platformSettingsService?: PlatformSettingsService,
    @Optional()
    @InjectRepository(OrderItem)
    private readonly orderItemRepository?: Repository<OrderItem>,
  ) {}

  private resolveStoreOwner(store?: Store | null): User | null {
    return store?.owner || store?.company?.owner || null;
  }

  private async getRateContext() {
    if (!this.platformSettingsService) return null;
    try {
      return await this.platformSettingsService.getExchangeRateConfig();
    } catch {
      return null;
    }
  }

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
      relations: ['owner', 'company', 'company.owner'],
    });
    if (!store) throw new NotFoundException('Tienda no encontrada');
    const previousStatus = store.status;
    store.status = suspend ? StoreStatus.SUSPENDED : StoreStatus.ACTIVE;
    const savedStore = await this.storeRepository.save(store);
    this.notificationService.notifyAdminBadgesChanged().catch(() => {});

    const owner = this.resolveStoreOwner(store);
    const debt = parseFloat(store.accumulatedCommissionDebt?.toString() || '0');
    const rateContext = await this.getRateContext();
    const debtDual = formatDualPrice(debt, rateContext).combined;

    if (suspend && previousStatus !== StoreStatus.SUSPENDED) {
      if (owner?.email) {
        this.mailService
          .sendStoreSuspendedForCommissions(owner.email, store.name, debt, 0, {
            baseCommission: debt,
          })
          .catch(() => {});
      }
      if (owner?.id) {
        this.notificationService
          .create({
            userId: owner.id,
            storeId: store.id,
            type: NotificationType.STORE_SUSPENDED,
            targetId: store.id,
            channelType: 'COMMISSION_DEBT',
            suspensionReason: 'COMMISSION_DEBT',
            title: `Tienda suspendida por deuda · ${store.name}`,
            body: `Tu tienda fue suspendida por saldo pendiente (${debtDual}). Toca para ver cómo pagar y reactivarla.`,
          })
          .catch(() => {});
      }
    } else if (!suspend && previousStatus === StoreStatus.SUSPENDED) {
      if (owner?.email) {
        this.mailService
          .sendCommissionPaymentApprovedNotice({
            email: owner.email,
            storeName: store.name,
            paidAmountUsd: 0,
            remainingDebtUsd: debt,
            reactivated: true,
          })
          .catch(() => {});
      }
      if (owner?.id) {
        this.notificationService
          .create({
            userId: owner.id,
            storeId: store.id,
            type: NotificationType.COMMISSION_PAYMENT_REVIEWED,
            targetId: store.id,
            channelType: 'COMMISSION_DEBT',
            title: `Tienda reactivada · ${store.name}`,
            body: `Tu tienda vuelve a estar activa y visible para los compradores. Toca para ver tu estado de cuenta.`,
          })
          .catch(() => {});
      }
    }

    return savedStore;
  }

  // ----------------------------------------------------
  // DEUDAS Y REPORTES PARA EL COMERCIO
  // ----------------------------------------------------
  private async loadAuthorizedStore(storeId: string, actor?: any) {
    const store = await this.storeRepository.findOne({
      where: { id: storeId },
      relations: ['owner', 'company', 'company.owner'],
    });
    if (!store) throw new NotFoundException('Tienda no encontrada');

    if (!actor) return store;

    if (actor.role === UserRole.ADMIN) {
      return store;
    }

    if (actor.isCollaborator) {
      const sameCompany = Boolean(
        actor.company?.id &&
          store.company?.id &&
          actor.company.id === store.company.id,
      );
      const allowedBranchIds: string[] = Array.isArray(actor.allowedBranchIds)
        ? actor.allowedBranchIds
        : [];
      const hasBranchAccess = Boolean(
        actor.hasFullBranchAccess || allowedBranchIds.includes(storeId),
      );
      if (!sameCompany || !hasBranchAccess) {
        throw new ForbiddenException(
          'No tienes autorización para consultar las comisiones de esta tienda',
        );
      }
      return store;
    }

    const isStoreOwner = Boolean(store.owner?.id && store.owner.id === actor.id);
    const isCompanyOwner = Boolean(
      (store.company?.owner?.id && store.company.owner.id === actor.id) ||
        (actor.company?.id &&
          store.company?.id &&
          actor.company.id === store.company.id),
    );
    if (!isStoreOwner && !isCompanyOwner) {
      throw new ForbiddenException(
        'No tienes autorización para consultar las comisiones de esta tienda',
      );
    }

    return store;
  }

  private getCommissionEligibleOrdersWhere(storeId: string) {
    return {
      store: { id: storeId },
      status: In([OrderStatus.FULLY_PAID, OrderStatus.PARTIALLY_PAID]),
      isCommissionVoided: false,
      platformCommissionAmount: MoreThan(0),
    };
  }

  private readonly commissionOrderSelectFields: (keyof Order)[] = [
    'id',
    'totalAmount',
    'finalAmount',
    'platformCommissionRate',
    'platformCommissionAmount',
    'isPartialPayment',
    'status',
    'createdAt',
  ];

  private async attachCommissionOrderSummaries(
    orders: Order[],
    paidOrderIdsMap: Map<string, { billingId: string; paidDate?: Date }> = new Map(),
    store?: Store,
  ) {
    if (orders.length === 0) return [];

    const summaryByOrderId = new Map<
      string,
      {
        itemImageUrl: string | null;
        firstItemTitle: string | null;
        itemsCount: number;
        items: Array<{
          id: string;
          title: string;
          quantity: number;
          price: number;
          variantLabel: string | null;
          imageUrl: string | null;
        }>;
      }
    >();

    if (this.orderItemRepository) {
      const orderIds = orders.map((o) => o.id);
      const orderItems = await this.orderItemRepository
        .createQueryBuilder('oi')
        .leftJoin('oi.order', 'ord')
        .leftJoin('oi.item', 'item')
        .leftJoin('oi.variant', 'variant')
        .select([
          'oi.id',
          'oi.title',
          'oi.quantity',
          'oi.price',
          'oi.variantLabel',
          'oi.variantId',
          'ord.id',
          'item.id',
          'item.title',
          'item.mainImage',
          'item.images',
          'variant.id',
          'variant.imageUrl',
          'variant.axisValues',
        ])
        .where('ord.id IN (:...orderIds)', { orderIds })
        .orderBy('oi.id', 'ASC')
        .getMany();

      for (const oi of orderItems) {
        const orderId = oi.order?.id;
        if (!orderId) continue;

        const existing = summaryByOrderId.get(orderId) || {
          itemImageUrl: null,
          firstItemTitle: null,
          itemsCount: 0,
          items: [],
        };
        const qty = Number(oi.quantity) || 1;
        existing.itemsCount += qty;
        const itemTitle = oi.title || oi.item?.title || 'Producto';
        if (!existing.firstItemTitle) {
          existing.firstItemTitle = itemTitle;
        }
        const img = resolveOrderItemImageUrl(oi);
        if (!existing.itemImageUrl) {
          existing.itemImageUrl = img;
        }
        existing.items.push({
          id: oi.id,
          title: itemTitle,
          quantity: qty,
          price: parseFloat(oi.price?.toString() || '0'),
          variantLabel: oi.variantLabel || null,
          imageUrl: img,
        });
        summaryByOrderId.set(orderId, existing);
      }
    }

    return orders.map((order) => {
      const summary = summaryByOrderId.get(order.id);
      const comm = parseFloat(order.platformCommissionAmount?.toString() || '0');
      const rate = parseFloat(order.platformCommissionRate?.toString() || '0');
      let commissionStatus: 'PENDING' | 'COLLECTED' | 'EXEMPT';
      if (store?.isCommissionExempt || comm <= 0 || rate <= 0) {
        commissionStatus = 'EXEMPT';
      } else if (paidOrderIdsMap.has(order.id)) {
        commissionStatus = 'COLLECTED';
      } else {
        commissionStatus = 'PENDING';
      }

      const settlement = paidOrderIdsMap.get(order.id);

      return {
        ...order,
        itemImageUrl: summary?.itemImageUrl ?? null,
        firstItemTitle: summary?.firstItemTitle ?? null,
        itemsCount: summary?.itemsCount ?? 0,
        items: summary?.items ?? [],
        commissionStatus,
        settlementBillingId: settlement?.billingId ?? null,
        settlementDate: settlement?.paidDate ?? null,
      };
    });
  }

  async getStoreCommissionOrders(
    storeId: string,
    query: CommissionOrdersQueryDto = {},
    actor?: any,
  ) {
    const store = await this.loadAuthorizedStore(storeId, actor);

    const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 50);
    const offset = Math.max(Number(query.offset) || 0, 0);
    const filter = query.filter || 'all';

    // 1. Obtener los IDs de órdenes cuya comisión ya fue saldada en facturaciones verificadas (PAID)
    const paidBillings =
      typeof this.billingRepository.find === 'function'
        ? await this.billingRepository.find({
            where: {
              store: { id: storeId },
              status: BillingStatus.PAID,
            },
            select: ['id', 'associatedOrderIds', 'createdAt', 'periodEndDate'],
            order: { createdAt: 'DESC' },
          })
        : [];

    const paidOrderIdsMap = new Map<
      string,
      { billingId: string; paidDate?: Date }
    >();
    for (const b of paidBillings) {
      if (Array.isArray(b.associatedOrderIds)) {
        for (const oid of b.associatedOrderIds) {
          if (!paidOrderIdsMap.has(oid)) {
            paidOrderIdsMap.set(oid, {
              billingId: b.id,
              paidDate: b.createdAt || b.periodEndDate,
            });
          }
        }
      }
    }
    const paidOrderIds = Array.from(paidOrderIdsMap.keys());

    // 2. Construir la cláusula WHERE según el filtro contable
    let whereClause: any;
    const baseConfirmedWhere = {
      store: { id: storeId },
      status: In([OrderStatus.FULLY_PAID, OrderStatus.PARTIALLY_PAID]),
      isCommissionVoided: false,
    };

    if (filter === 'exempt') {
      if (store.isCommissionExempt) {
        whereClause = { ...baseConfirmedWhere };
      } else {
        whereClause = {
          ...baseConfirmedWhere,
          platformCommissionAmount: 0,
        };
      }
    } else if (filter === 'collected') {
      if (paidOrderIds.length === 0) {
        whereClause = null;
      } else {
        whereClause = {
          ...baseConfirmedWhere,
          id: In(paidOrderIds),
        };
      }
    } else if (filter === 'pending') {
      if (store.isCommissionExempt) {
        whereClause = null;
      } else if (paidOrderIds.length === 0) {
        whereClause = {
          ...baseConfirmedWhere,
          platformCommissionAmount: MoreThan(0),
        };
      } else {
        whereClause = {
          ...baseConfirmedWhere,
          id: Not(In(paidOrderIds)),
          platformCommissionAmount: MoreThan(0),
        };
      }
    } else {
      // 'all'
      whereClause = { ...baseConfirmedWhere };
    }

    let orders: Order[] = [];
    let total = 0;

    if (whereClause !== null) {
      const [fetchedOrders, count] = await this.orderRepository.findAndCount({
        where: whereClause,
        select: this.commissionOrderSelectFields,
        order: { createdAt: 'DESC' },
        take: limit,
        skip: offset,
      });
      orders = fetchedOrders;
      total = count;
    }

    // 3. Contadores de resumen para alimentar las pestañas de la UI
    let allCount = 0;
    let pendingCount = 0;
    let collectedCount = 0;
    let exemptCount = 0;

    try {
      if (typeof this.orderRepository.count === 'function') {
        allCount = await this.orderRepository.count({
          where: baseConfirmedWhere,
        });
        if (store.isCommissionExempt) {
          exemptCount = allCount;
          pendingCount = 0;
          collectedCount = 0;
        } else {
          exemptCount = await this.orderRepository.count({
            where: {
              ...baseConfirmedWhere,
              platformCommissionAmount: 0,
            },
          });
          if (paidOrderIds.length > 0) {
            collectedCount = await this.orderRepository.count({
              where: {
                ...baseConfirmedWhere,
                id: In(paidOrderIds),
              },
            });
          }
          pendingCount = Math.max(allCount - exemptCount - collectedCount, 0);
        }
      } else {
        allCount = total;
        pendingCount = total;
      }
    } catch (_) {
      allCount = total;
      pendingCount = total;
    }

    const items = await this.attachCommissionOrderSummaries(
      orders,
      paidOrderIdsMap,
      store,
    );

    return {
      items,
      total,
      limit,
      offset,
      hasMore: offset + items.length < total,
      summaryCounts: {
        all: allCount,
        pending: pendingCount,
        collected: collectedCount,
        exempt: exemptCount,
      },
    };
  }

  async getStoreDebtHub(storeId: string, actor?: any) {
    const store = await this.loadAuthorizedStore(storeId, actor);

    const settings = await this.settingsRepository.findOne({ where: {} });

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

    // Mantener resumen liviano de últimas 20 órdenes con resumen de miniatura para compatibilidad
    const rawRecentOrders = await this.orderRepository.find({
      where: this.getCommissionEligibleOrdersWhere(storeId),
      select: this.commissionOrderSelectFields,
      order: { createdAt: 'DESC' },
      take: 20,
    });
    const recentOrders = await this.attachCommissionOrderSummaries(
      rawRecentOrders,
    );

    // Buscar comprobantes de pago de la tienda (historial completo)
    const paymentReports = await this.reportRepository.find({
      where: { billing: { store: { id: storeId } } },
      relations: ['paymentMethod', 'reviewedBy'],
      order: { createdAt: 'DESC' },
      take: 50,
    });

    const platformPaymentMethods = await this.platformPaymentMethodRepository.find({
      where: { isActive: true },
      order: { createdAt: 'ASC' },
    });

    const accumulatedDebt = parseFloat(
      store.accumulatedCommissionDebt?.toString() || '0',
    );
    const hasPendingReport =
      currentBilling?.status === BillingStatus.PAYMENT_REPORTED ||
      paymentReports.some(
        (r) => r.status === PaymentReportStatus.PENDING_REVIEW,
      );
    const latestRejected =
      paymentReports.find((r) => r.status === PaymentReportStatus.REJECTED) ||
      null;
    const isSuspended = store.status === StoreStatus.SUSPENDED;
    const isSuspendedByDebt =
      isSuspended &&
      (currentBilling?.status === BillingStatus.SUSPENDED ||
        currentBilling?.status === BillingStatus.OVERDUE ||
        currentBilling?.status === BillingStatus.PAYMENT_REPORTED ||
        accumulatedDebt > 0);

    return {
      store: {
        id: store.id,
        name: store.name,
        status: store.status,
        accumulatedCommissionDebt: accumulatedDebt,
      },
      currentBilling,
      recentOrders,
      paymentReports,
      settings: {
        isEnabled: settings?.isEnabled ?? false,
        gracePeriodDays: settings?.gracePeriodDays ?? 3,
        fineType: settings?.fineType ?? FineType.PERCENTAGE,
        fineValue: parseFloat(settings?.fineValue?.toString() || '10'),
      },
      platformPaymentMethods,
      suspensionInfo: {
        isSuspended,
        isSuspendedByDebt,
        hasPendingReport,
        latestRejectedReport: latestRejected
          ? {
              id: latestRejected.id,
              amount: parseFloat(latestRejected.amount?.toString() || '0'),
              rejectionReason: latestRejected.rejectionReason || null,
              reviewedAt: latestRejected.reviewedAt || null,
              createdAt: latestRejected.createdAt,
            }
          : null,
      },
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
    let billing: StoreCommissionBilling | null = null;
    if (billingId && billingId.trim().length > 0) {
      billing = await this.billingRepository.findOne({
        where: { id: billingId, store: { id: storeId } },
        relations: ['store'],
      });
    }

    if (!billing) {
      // Buscar última facturación activa o pendiente de la tienda
      billing = await this.billingRepository.findOne({
        where: {
          store: { id: storeId },
          status: In([
            BillingStatus.PENDING,
            BillingStatus.PAYMENT_REPORTED,
            BillingStatus.OVERDUE,
            BillingStatus.SUSPENDED,
          ]),
        },
        relations: ['store'],
        order: { createdAt: 'DESC' },
      });
    }

    if (!billing) {
      // Si no existe facturación semanal generada todavía, creamos un registro de ciclo abierto
      const store = await this.storeRepository.findOne({
        where: { id: storeId },
      });
      if (!store) throw new NotFoundException('Tienda no encontrada');

      const now = new Date();
      const debt = parseFloat(
        store.accumulatedCommissionDebt?.toString() || '0',
      );
      const settings = await this.settingsRepository.findOne({ where: {} });
      const graceDays = settings?.gracePeriodDays || 3;
      const dueDate = new Date(now);
      dueDate.setDate(dueDate.getDate() + graceDays);

      billing = this.billingRepository.create({
        store,
        periodStartDate: now,
        periodEndDate: now,
        totalSalesAmount: 0,
        commissionAmount: debt,
        fineAmount: 0,
        totalDue: debt > 0 ? debt : dto.amount,
        paidAmount: 0,
        dueDate,
        gracePeriodEndDate: dueDate,
        status: BillingStatus.PENDING,
        associatedOrderIds: [],
      });
      billing = await this.billingRepository.save(billing);
    }

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

    // Actualizar estado de billing a PAYMENT_REPORTED
    billing.status = BillingStatus.PAYMENT_REPORTED;
    await this.billingRepository.save(billing);

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

    this.notificationService.notifyAdminBadgesChanged().catch(() => {});

    return savedReport;
  }

  // ----------------------------------------------------
  // LISTADO DE REPORTES DE PAGO (ADMIN)
  // ----------------------------------------------------
  async getPaymentReports(options?: {
    status?: PaymentReportStatus;
    storeId?: string;
  }) {
    const where: any = {};
    if (options?.status) {
      where.status = options.status;
    }
    if (options?.storeId) {
      where.billing = { store: { id: options.storeId } };
    }

    const isPending = options?.status === PaymentReportStatus.PENDING_REVIEW;

    return this.reportRepository.find({
      where,
      relations: [
        'billing',
        'billing.store',
        'billing.store.owner',
        'paymentMethod',
        'reviewedBy',
      ],
      order: { createdAt: isPending ? 'ASC' : 'DESC' },
    });
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
      relations: [
        'billing',
        'billing.store',
        'billing.store.owner',
        'billing.store.company',
        'billing.store.company.owner',
      ],
    });
    if (!report) throw new NotFoundException('Reporte de pago no encontrado');
    if (report.status !== PaymentReportStatus.PENDING_REVIEW) {
      throw new BadRequestException(
        'El reporte ya ha sido auditado previamente',
      );
    }

    report.status = action.status;
    report.rejectionReason = action.rejectionReason || null;
    report.reviewedBy = reviewer;
    report.reviewedAt = new Date();
    await this.reportRepository.save(report);

    const billing = report.billing;
    const store = billing.store;
    const owner = this.resolveStoreOwner(store);
    const reportAmountUsd = parseFloat(report.amount.toString());
    const rateContext = await this.getRateContext();

    if (action.status === PaymentReportStatus.APPROVED) {
      billing.paidAmount =
        Math.round(
          (parseFloat(billing.paidAmount?.toString() || '0') +
            reportAmountUsd) *
            100,
        ) / 100;
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
        Math.round((currentDebt - reportAmountUsd) * 100) / 100,
      );
      store.accumulatedCommissionDebt = newDebt;

      const wasSuspended = store.status === StoreStatus.SUSPENDED;
      const reactivated = wasSuspended && newDebt === 0;
      // Si estaba suspendida por mora y saldó deuda, reactivarla
      if (reactivated) {
        store.status = StoreStatus.ACTIVE;
      }
      await this.storeRepository.save(store);

      const paidDual = formatDualPrice(reportAmountUsd, rateContext).combined;
      const remainingDual = formatDualPrice(newDebt, rateContext).combined;

      if (owner?.email) {
        this.mailService
          .sendCommissionPaymentApprovedNotice({
            email: owner.email,
            storeName: store.name,
            paidAmountUsd: reportAmountUsd,
            remainingDebtUsd: newDebt,
            reactivated,
          })
          .catch(() => {});
      }
      if (owner?.id) {
        this.notificationService
          .create({
            userId: owner.id,
            storeId: store.id,
            type: NotificationType.COMMISSION_PAYMENT_REVIEWED,
            targetId: report.id,
            channelType: 'COMMISSION_DEBT',
            title: reactivated
              ? `¡Pago aprobado y tienda reactivada! · ${store.name}`
              : `Pago de comisión aprobado · ${store.name}`,
            body: reactivated
              ? `Se aprobó tu pago por ${paidDual}. Tu deuda quedó en $0.00 y tu tienda ya vuelve a estar activa.`
              : `Se acreditó tu abono por ${paidDual}. Saldo pendiente: ${remainingDual}.`,
          })
          .catch(() => {});
      }
    } else {
      // Si fue rechazado, restaurar estado coherente de la factura
      if (store.status === StoreStatus.SUSPENDED) {
        billing.status = BillingStatus.SUSPENDED;
      } else if (
        billing.gracePeriodEndDate &&
        new Date(billing.gracePeriodEndDate) < new Date()
      ) {
        billing.status = BillingStatus.OVERDUE;
      } else {
        billing.status = BillingStatus.PENDING;
      }
      await this.billingRepository.save(billing);

      const currentDebt = parseFloat(
        store.accumulatedCommissionDebt?.toString() || '0',
      );
      const reason =
        action.rejectionReason || 'No se pudo validar el comprobante.';
      const reportedDual = formatDualPrice(reportAmountUsd, rateContext).combined;

      if (owner?.email) {
        this.mailService
          .sendCommissionPaymentRejectedNotice({
            email: owner.email,
            storeName: store.name,
            reportedAmountUsd: reportAmountUsd,
            remainingDebtUsd: currentDebt,
            rejectionReason: reason,
            isSuspended: store.status === StoreStatus.SUSPENDED,
          })
          .catch(() => {});
      }
      if (owner?.id) {
        this.notificationService
          .create({
            userId: owner.id,
            storeId: store.id,
            type: NotificationType.COMMISSION_PAYMENT_REVIEWED,
            targetId: report.id,
            channelType: 'COMMISSION_DEBT',
            title: `Comprobante rechazado · ${store.name}`,
            body: `Tu pago reportado (${reportedDual}) fue rechazado: "${reason}". Toca para enviar un comprobante corregido.`,
          })
          .catch(() => {});
      }
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
