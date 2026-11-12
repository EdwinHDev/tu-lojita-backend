import { Injectable, Logger, Optional } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, LessThanOrEqual, MoreThan } from 'typeorm';
import { StoreCommissionBilling } from '../entities/store-commission-billing.entity';
import { CommissionSettings } from '../entities/commission-settings.entity';
import { CommissionPaymentReport } from '../entities/commission-payment-report.entity';
import { PlatformPaymentMethod } from '../entities/platform-payment-method.entity';
import { Store } from 'src/store/entities/store.entity';
import { StoreStatus } from 'src/store/types/status.enum';
import { Order } from 'src/order/entities/order.entity';
import { OrderStatus } from 'src/order/types';
import {
  BillingStatus,
  FineType,
  PaymentReportStatus,
} from '../types';
import { MailService } from 'src/common/mail/mail.service';
import { NotificationService } from 'src/notification/notification.service';
import { NotificationType } from 'src/notification/entities/notification.entity';
import { PlatformSettingsService } from 'src/platform-settings/platform-settings.service';
import {
  ExchangeRateEmailContext,
  formatDualPrice,
} from 'src/common/utils/currency-format.utils';
import {
  formatDateInTimezone,
  getLocalDate,
  getStartOfTodayInTimezone,
} from 'src/common/utils/timezone.utils';
import { User } from 'src/user/entities/user.entity';

const CARACAS_TZ = 'America/Caracas';
const MS_PER_DAY = 86_400_000;

@Injectable()
export class CommissionBillingCron {
  private readonly logger = new Logger(CommissionBillingCron.name);

  constructor(
    @InjectRepository(StoreCommissionBilling)
    private readonly billingRepository: Repository<StoreCommissionBilling>,
    @InjectRepository(CommissionSettings)
    private readonly settingsRepository: Repository<CommissionSettings>,
    @InjectRepository(Store)
    private readonly storeRepository: Repository<Store>,
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    @InjectRepository(CommissionPaymentReport)
    private readonly reportRepository: Repository<CommissionPaymentReport>,
    @InjectRepository(PlatformPaymentMethod)
    private readonly paymentMethodRepository: Repository<PlatformPaymentMethod>,
    private readonly mailService: MailService,
    private readonly notificationService: NotificationService,
    @Optional()
    private readonly platformSettingsService?: PlatformSettingsService,
  ) {}

  private resolveStoreOwner(store?: Store | null): User | null {
    return store?.owner || store?.company?.owner || null;
  }

  private calculateFineAmount(
    baseCommission: number,
    settings?: CommissionSettings | null,
  ): number {
    if (!baseCommission || baseCommission <= 0) return 0;
    const fineType = settings?.fineType || FineType.PERCENTAGE;
    const fineValue = parseFloat(settings?.fineValue?.toString() || '10');
    if (fineType === FineType.PERCENTAGE) {
      return Math.round(((baseCommission * fineValue) / 100) * 100) / 100;
    }
    return Math.round(fineValue * 100) / 100;
  }

  private async getRateContext(): Promise<ExchangeRateEmailContext | null> {
    if (!this.platformSettingsService) return null;
    try {
      return await this.platformSettingsService.getExchangeRateConfig();
    } catch {
      return null;
    }
  }

  private async getPaymentMethodsSummary(): Promise<string[]> {
    try {
      const methods = await this.paymentMethodRepository.find({
        where: { isActive: true },
        order: { createdAt: 'ASC' },
      });
      return methods.slice(0, 4).map((m) => {
        const details = Object.values(m.accountDetails || {})
          .filter((v) => v !== null && v !== undefined && String(v).trim() !== '')
          .slice(0, 3)
          .join(' · ');
        return details ? `${m.title}: ${details}` : m.title;
      });
    } catch {
      return [];
    }
  }

  private async hasPendingPaymentReport(storeId: string): Promise<boolean> {
    const count = await this.reportRepository.count({
      where: {
        billing: { store: { id: storeId } },
        status: PaymentReportStatus.PENDING_REVIEW,
      },
    });
    return count > 0;
  }

  private getCaracasDayOfWeek(date: Date = new Date()): number {
    const loc = getLocalDate(date, CARACAS_TZ);
    return new Date(Date.UTC(loc.year, loc.month, loc.day)).getUTCDay();
  }

  private getNextMondayIsoKey(date: Date = new Date()): string {
    const loc = getLocalDate(date, CARACAS_TZ);
    const utcDay = new Date(Date.UTC(loc.year, loc.month, loc.day)).getUTCDay();
    const daysToMonday = utcDay === 0 ? 1 : (8 - utcDay) % 7 || 7;
    const mondayUtc = new Date(
      Date.UTC(loc.year, loc.month, loc.day + daysToMonday),
    );
    return mondayUtc.toISOString().slice(0, 10);
  }

  private getDaysRemainingCaracas(dueDate: Date, now: Date): number {
    const dueStart = getStartOfTodayInTimezone(new Date(dueDate), CARACAS_TZ);
    const todayStart = getStartOfTodayInTimezone(now, CARACAS_TZ);
    return Math.max(
      0,
      Math.round((dueStart.getTime() - todayStart.getTime()) / MS_PER_DAY),
    );
  }

  private async alreadyNotifiedToday(
    targetId: string,
    startOfToday: Date,
  ): Promise<boolean> {
    return this.notificationService.hasNotificationForTargetSince(
      NotificationType.COMMISSION_DEBT_REMINDER,
      targetId,
      startOfToday,
    );
  }

  // 1. Corte Semanal: Todos los lunes a las 00:00 hora de Venezuela (America/Caracas)
  @Cron('0 0 * * 1', { timeZone: CARACAS_TZ })
  async handleWeeklyCommissionCut() {
    this.logger.log(
      'Iniciando corte semanal de comisiones (Lunes 00:00 VET)...',
    );

    const settings = await this.settingsRepository.findOne({ where: {} });
    if (!settings || !settings.isEnabled) {
      this.logger.log(
        'Las comisiones están desactivadas globalmente. Se omite corte.',
      );
      return;
    }

    const stores = await this.storeRepository.find({
      relations: ['owner', 'company', 'company.owner'],
    });
    const gracePeriodDays = settings.gracePeriodDays || 3;
    const rateContext = await this.getRateContext();
    const paymentMethodsSummary = await this.getPaymentMethodsSummary();

    const now = new Date();
    const periodStart = new Date(now);
    periodStart.setDate(periodStart.getDate() - 7);

    const dueDate = new Date(now);
    dueDate.setDate(dueDate.getDate() + gracePeriodDays - 1);
    dueDate.setHours(23, 59, 59, 999);

    for (const store of stores) {
      if (store.isCommissionExempt) continue;

      const debt = parseFloat(
        store.accumulatedCommissionDebt?.toString() || '0',
      );
      if (debt <= 0) continue;

      const orders = await this.orderRepository.find({
        where: {
          store: { id: store.id },
          status: In([OrderStatus.FULLY_PAID, OrderStatus.PARTIALLY_PAID]),
          isCommissionVoided: false,
          platformCommissionAmount: MoreThan(0),
        },
      });

      const totalSales = orders.reduce(
        (sum, o) => sum + parseFloat(o.finalAmount?.toString() || '0'),
        0,
      );

      const billing = this.billingRepository.create({
        store,
        periodStartDate: periodStart,
        periodEndDate: now,
        totalSalesAmount: totalSales,
        commissionAmount: debt,
        fineAmount: 0,
        totalDue: debt,
        paidAmount: 0,
        dueDate,
        gracePeriodEndDate: dueDate,
        status: BillingStatus.PENDING,
        associatedOrderIds: orders.map((o) => o.id),
      });

      const savedBilling = await this.billingRepository.save(billing);
      this.logger.log(
        `Facturación generada para tienda ${store.name} (ID: ${store.id}) por monto de $${debt}`,
      );

      const owner = this.resolveStoreOwner(store);
      const finePreview = this.calculateFineAmount(debt, settings);
      const amountDual = formatDualPrice(debt, rateContext).combined;
      const dueDateLabel = formatDateInTimezone(dueDate, CARACAS_TZ);

      if (owner?.email) {
        await this.mailService.sendWeeklyCommissionInvoice(
          owner.email,
          store.name,
          debt,
          dueDate,
          {
            gracePeriodDays,
            finePreviewAmount: finePreview,
            paymentMethodsSummary,
          },
        );
      }

      if (owner?.id) {
        await this.notificationService.create({
          userId: owner.id,
          storeId: store.id,
          type: NotificationType.COMMISSION_DEBT_REMINDER,
          targetId: savedBilling.id,
          channelType: 'COMMISSION_DEBT',
          title: `Corte de comisiones emitido · ${store.name}`,
          body: `Debes ${amountDual}. Tienes ${gracePeriodDays} ${gracePeriodDays === 1 ? 'día' : 'días'} de gracia (hasta el ${dueDateLabel}). Toca para ver cuentas y reportar tu pago.`,
        });
      }
    }
  }

  // 2. Recordatorios Diarios (Pre-corte fin de semana, período de gracia y mora): Todos los días 09:00 AM VET
  @Cron('0 9 * * *', { timeZone: CARACAS_TZ })
  async handleDailyCommissionReminders() {
    this.logger.log(
      'Ejecutando recordatorios diarios de comisiones (09:00 AM VET)...',
    );

    const settings = await this.settingsRepository.findOne({ where: {} });
    if (!settings || !settings.isEnabled) {
      this.logger.log(
        'Las comisiones están desactivadas globalmente. Se omiten recordatorios diarios.',
      );
      return;
    }

    const now = new Date();
    const startOfToday = getStartOfTodayInTimezone(now, CARACAS_TZ);
    const rateContext = await this.getRateContext();
    const paymentMethodsSummary = await this.getPaymentMethodsSummary();
    const gracePeriodDays = settings.gracePeriodDays || 3;

    const coveredStoreIds = new Set<string>();

    // A) Facturas activas en período de gracia (PENDING / OVERDUE)
    const activeBillings = await this.billingRepository.find({
      where: {
        status: In([BillingStatus.PENDING, BillingStatus.OVERDUE]),
      },
      relations: ['store', 'store.owner', 'store.company', 'store.company.owner'],
      order: { createdAt: 'DESC' },
    });

    for (const billing of activeBillings) {
      const store = billing.store;
      if (!store || store.isCommissionExempt) continue;
      if (store.status === StoreStatus.SUSPENDED) continue;

      coveredStoreIds.add(store.id);

      const remainingDue = Math.max(
        0,
        Math.round(
          (parseFloat(billing.totalDue?.toString() || '0') -
            parseFloat(billing.paidAmount?.toString() || '0')) *
            100,
        ) / 100,
      );
      if (remainingDue <= 0) continue;

      if (await this.hasPendingPaymentReport(store.id)) continue;
      if (await this.alreadyNotifiedToday(billing.id, startOfToday)) continue;

      const owner = this.resolveStoreOwner(store);
      const graceEnd = billing.gracePeriodEndDate || billing.dueDate;
      const daysRemaining = this.getDaysRemainingCaracas(graceEnd, now);
      const finePreview = this.calculateFineAmount(remainingDue, settings);
      const amountDual = formatDualPrice(remainingDue, rateContext).combined;
      const fineDual = formatDualPrice(finePreview, rateContext).combined;
      const dueDateLabel = formatDateInTimezone(new Date(graceEnd), CARACAS_TZ);

      if (owner?.email) {
        await this.mailService.sendCommissionGraceReminder(
          owner.email,
          store.name,
          remainingDue,
          {
            daysRemaining,
            dueDate: new Date(graceEnd),
            finePreviewAmount: finePreview,
            paymentMethodsSummary,
          },
        );
      }

      if (owner?.id) {
        const countdownLabel =
          daysRemaining === 0
            ? 'Hoy 11:59 PM vence tu plazo'
            : daysRemaining === 1
              ? 'Queda 1 día (D-1)'
              : `Quedan ${daysRemaining} días (D-${daysRemaining})`;

        await this.notificationService.create({
          userId: owner.id,
          storeId: store.id,
          type: NotificationType.COMMISSION_DEBT_REMINDER,
          targetId: billing.id,
          channelType: 'COMMISSION_DEBT',
          title: `${countdownLabel} · Comisiones ${store.name}`,
          body: `Saldo pendiente: ${amountDual} (vence ${dueDateLabel}). Evita la suspensión y multa de ${fineDual}. Toca para ver cuentas y reportar tu pago.`,
        });
      }
    }

    // B) Tiendas ya SUSPENDIDAS con facturas impagas (recordatorio diario de reactivación)
    const suspendedBillings = await this.billingRepository.find({
      where: {
        status: In([
          BillingStatus.SUSPENDED,
          BillingStatus.OVERDUE,
          BillingStatus.PENDING,
        ]),
      },
      relations: ['store', 'store.owner', 'store.company', 'store.company.owner'],
      order: { createdAt: 'DESC' },
    });

    for (const billing of suspendedBillings) {
      const store = billing.store;
      if (!store || store.status !== StoreStatus.SUSPENDED) continue;
      if (store.isCommissionExempt || coveredStoreIds.has(store.id)) continue;

      coveredStoreIds.add(store.id);

      const totalDue = Math.max(
        0,
        Math.round(
          (parseFloat(billing.totalDue?.toString() || '0') -
            parseFloat(billing.paidAmount?.toString() || '0')) *
            100,
        ) / 100,
      );
      if (totalDue <= 0) continue;

      if (await this.hasPendingPaymentReport(store.id)) continue;
      if (await this.alreadyNotifiedToday(billing.id, startOfToday)) continue;

      const fineAmount = parseFloat(billing.fineAmount?.toString() || '0');
      const baseCommission = Math.max(
        0,
        Math.round((totalDue - fineAmount) * 100) / 100,
      );
      const owner = this.resolveStoreOwner(store);
      const totalDual = formatDualPrice(totalDue, rateContext).combined;

      if (owner?.email) {
        await this.mailService.sendStoreSuspendedForCommissions(
          owner.email,
          store.name,
          totalDue,
          fineAmount,
          {
            baseCommission,
            isDailyReminder: true,
            paymentMethodsSummary,
          },
        );
      }

      if (owner?.id) {
        await this.notificationService.create({
          userId: owner.id,
          storeId: store.id,
          type: NotificationType.COMMISSION_DEBT_REMINDER,
          targetId: billing.id,
          channelType: 'COMMISSION_DEBT',
          title: `Tienda suspendida por mora · ${store.name}`,
          body: `Tu tienda sigue oculta al público. Total por regularizar: ${totalDual}. Toca para ver cómo pagar y reactivarla automáticamente.`,
        });
      }
    }

    // C) Pre-corte de fin de semana (Sábado = 6, Domingo = 0 en America/Caracas)
    const dayOfWeek = this.getCaracasDayOfWeek(now);
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      const storesWithDebt = await this.storeRepository.find({
        where: {
          status: StoreStatus.ACTIVE,
          isCommissionExempt: false,
          accumulatedCommissionDebt: MoreThan(0),
        },
        relations: ['owner', 'company', 'company.owner'],
      });

      const nextMondayKey = this.getNextMondayIsoKey(now);

      for (const store of storesWithDebt) {
        if (coveredStoreIds.has(store.id)) continue;

        const openBillingCount = await this.billingRepository.count({
          where: {
            store: { id: store.id },
            status: In([
              BillingStatus.PENDING,
              BillingStatus.OVERDUE,
              BillingStatus.PAYMENT_REPORTED,
              BillingStatus.SUSPENDED,
            ]),
          },
        });
        if (openBillingCount > 0) continue;
        if (await this.hasPendingPaymentReport(store.id)) continue;

        const precutTargetId = `precut:${store.id}:${nextMondayKey}`;
        if (await this.alreadyNotifiedToday(precutTargetId, startOfToday)) {
          continue;
        }

        const debt = parseFloat(
          store.accumulatedCommissionDebt?.toString() || '0',
        );
        if (debt <= 0) continue;

        const owner = this.resolveStoreOwner(store);
        const amountDual = formatDualPrice(debt, rateContext).combined;
        const cutLabel = dayOfWeek === 0 ? 'mañana lunes' : 'este lunes';

        if (owner?.email) {
          await this.mailService.sendCommissionPreCutReminder({
            email: owner.email,
            storeName: store.name,
            accumulatedAmount: debt,
            cutDateLabel: cutLabel,
            gracePeriodDays,
            paymentMethodsSummary,
          });
        }

        if (owner?.id) {
          await this.notificationService.create({
            userId: owner.id,
            storeId: store.id,
            type: NotificationType.COMMISSION_DEBT_REMINDER,
            targetId: precutTargetId,
            channelType: 'COMMISSION_DEBT',
            title: `Pre-corte semanal de comisiones · ${store.name}`,
            body: `Acumulas ${amountDual} por ventas recientes. El corte se genera ${cutLabel} (${gracePeriodDays} días de gracia). Toca para consultar cuentas o adelantar tu pago.`,
          });
        }
      }
    }
  }

  // 3. Suspensión y Aplicación de Multas dinámica: Todos los días a las 23:59 VET
  @Cron('59 23 * * *', { timeZone: CARACAS_TZ })
  async handleCommissionSuspensionAndFines() {
    this.logger.log(
      'Evaluando suspensiones y multas por comisiones vencidas (23:59 VET)...',
    );

    const settings = await this.settingsRepository.findOne({ where: {} });
    if (settings && !settings.isEnabled) {
      this.logger.log(
        'Las comisiones están desactivadas globalmente. Se omite evaluación de suspensiones.',
      );
      return;
    }

    const rateContext = await this.getRateContext();
    const paymentMethodsSummary = await this.getPaymentMethodsSummary();

    const overdueBillings = await this.billingRepository.find({
      where: {
        status: In([BillingStatus.PENDING, BillingStatus.OVERDUE]),
        gracePeriodEndDate: LessThanOrEqual(new Date()),
      },
      relations: ['store', 'store.owner', 'store.company', 'store.company.owner'],
    });

    for (const billing of overdueBillings) {
      const store = billing.store;
      if (!store || store.isCommissionExempt) continue;
      if (await this.hasPendingPaymentReport(store.id)) continue;

      const commissionAmount = parseFloat(billing.commissionAmount.toString());
      const paidAmount = parseFloat(billing.paidAmount?.toString() || '0');
      const unpaidBase = Math.max(
        0,
        Math.round((commissionAmount - paidAmount) * 100) / 100,
      );
      const fine = this.calculateFineAmount(unpaidBase || commissionAmount, settings);

      billing.fineAmount = fine;
      billing.totalDue = Math.round((commissionAmount + fine) * 100) / 100;
      billing.status = BillingStatus.SUSPENDED;
      await this.billingRepository.save(billing);

      const totalDueRemaining = Math.max(
        0,
        Math.round((billing.totalDue - paidAmount) * 100) / 100,
      );

      store.status = StoreStatus.SUSPENDED;
      const currentDebt = parseFloat(
        store.accumulatedCommissionDebt?.toString() || '0',
      );
      store.accumulatedCommissionDebt =
        Math.round((currentDebt + fine) * 100) / 100;
      await this.storeRepository.save(store);

      this.logger.warn(
        `Tienda ${store.name} suspendida por comisiones impagas. Multa aplicada: $${fine}`,
      );

      const owner = this.resolveStoreOwner(store);
      const totalDual = formatDualPrice(totalDueRemaining, rateContext).combined;
      const fineDual = formatDualPrice(fine, rateContext).combined;

      if (owner?.email) {
        await this.mailService.sendStoreSuspendedForCommissions(
          owner.email,
          store.name,
          totalDueRemaining,
          fine,
          {
            baseCommission: unpaidBase,
            paymentMethodsSummary,
          },
        );
      }

      if (owner?.id) {
        await this.notificationService.create({
          userId: owner.id,
          storeId: store.id,
          type: NotificationType.STORE_SUSPENDED,
          targetId: store.id,
          channelType: 'COMMISSION_DEBT',
          suspensionReason: 'COMMISSION_DEBT',
          title: `Tienda suspendida por deuda · ${store.name}`,
          body: `Venció tu período de gracia. Se aplicó multa de ${fineDual}. Total a pagar: ${totalDual}. Reporta el pago aquí para reactivarla automáticamente.`,
        });
      }
    }
  }
}
