import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, LessThanOrEqual } from 'typeorm';
import { StoreCommissionBilling } from '../entities/store-commission-billing.entity';
import { CommissionSettings } from '../entities/commission-settings.entity';
import { Store } from 'src/store/entities/store.entity';
import { StoreStatus } from 'src/store/types/status.enum';
import { Order } from 'src/order/entities/order.entity';
import { BillingStatus, FineType } from '../types';
import { MailService } from 'src/common/mail/mail.service';

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
    private readonly mailService: MailService,
  ) {}

  // 1. Corte Semanal: Todos los lunes a las 00:00 hora de Venezuela (America/Caracas)
  @Cron('0 0 * * 1', { timeZone: 'America/Caracas' })
  async handleWeeklyCommissionCut() {
    this.logger.log('Iniciando corte semanal de comisiones (Lunes 00:00 VET)...');

    const settings = await this.settingsRepository.findOne({ where: {} });
    if (!settings || !settings.isEnabled) {
      this.logger.log('Las comisiones están desactivadas globalmente. Se omite corte.');
      return;
    }

    const stores = await this.storeRepository.find({
      relations: ['owner'],
    });

    const now = new Date();
    const periodStart = new Date(now);
    periodStart.setDate(periodStart.getDate() - 7); // Lunes anterior

    // Período de gracia: 3 días -> Miércoles a las 23:59:59
    const dueDate = new Date(now);
    dueDate.setDate(dueDate.getDate() + (settings.gracePeriodDays || 3) - 1);
    dueDate.setHours(23, 59, 59, 999);

    for (const store of stores) {
      if (store.isCommissionExempt) continue;

      const debt = parseFloat(store.accumulatedCommissionDebt?.toString() || '0');
      if (debt <= 0) continue;

      // Buscar órdenes del período
      const orders = await this.orderRepository.find({
        where: {
          store: { id: store.id },
          isCommissionVoided: false,
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

      await this.billingRepository.save(billing);
      this.logger.log(
        `Facturación generada para tienda ${store.name} (ID: ${store.id}) por monto de $${debt}`,
      );

      // Notificar por correo al dueño de la tienda
      if (store.owner?.email) {
        await this.mailService.sendWeeklyCommissionInvoice(
          store.owner.email,
          store.name,
          debt,
          dueDate,
        );
      }
    }
  }

  // 2. Recordatorio de Vencimiento de Gracia: Miércoles a las 09:00 hora de Venezuela
  @Cron('0 9 * * 3', { timeZone: 'America/Caracas' })
  async handleGracePeriodReminder() {
    this.logger.log('Enviando recordatorios de gracia de comisiones (Miércoles 09:00 VET)...');

    const pendingBillings = await this.billingRepository.find({
      where: { status: BillingStatus.PENDING },
      relations: ['store', 'store.owner'],
    });

    for (const billing of pendingBillings) {
      if (billing.store?.owner?.email) {
        await this.mailService.sendCommissionGraceReminder(
          billing.store.owner.email,
          billing.store.name,
          parseFloat(billing.totalDue.toString()),
        );
      }
    }
  }

  // 3. Suspensión y Aplicación de Multas: Miércoles a las 23:59 hora de Venezuela
  @Cron('59 23 * * 3', { timeZone: 'America/Caracas' })
  async handleCommissionSuspensionAndFines() {
    this.logger.log('Aplicando suspensiones y multas por comisiones (Miércoles 23:59 VET)...');

    const settings = await this.settingsRepository.findOne({ where: {} });
    const fineType = settings?.fineType || FineType.PERCENTAGE;
    const fineValue = parseFloat(settings?.fineValue?.toString() || '10');

    const overdueBillings = await this.billingRepository.find({
      where: {
        status: In([BillingStatus.PENDING, BillingStatus.OVERDUE]),
        gracePeriodEndDate: LessThanOrEqual(new Date()),
      },
      relations: ['store', 'store.owner'],
    });

    for (const billing of overdueBillings) {
      const commissionAmount = parseFloat(billing.commissionAmount.toString());
      let fine = 0;

      if (fineType === FineType.PERCENTAGE) {
        fine = Math.round(((commissionAmount * fineValue) / 100) * 100) / 100;
      } else {
        fine = fineValue;
      }

      billing.fineAmount = fine;
      billing.totalDue = Math.round((commissionAmount + fine) * 100) / 100;
      billing.status = BillingStatus.SUSPENDED;
      await this.billingRepository.save(billing);

      // Suspender la tienda y sumarle la multa a la deuda
      const store = billing.store;
      store.status = StoreStatus.SUSPENDED;
      const currentDebt = parseFloat(store.accumulatedCommissionDebt?.toString() || '0');
      store.accumulatedCommissionDebt = Math.round((currentDebt + fine) * 100) / 100;
      await this.storeRepository.save(store);

      this.logger.warn(
        `Tienda ${store.name} suspendida por comisiones impagas. Multa aplicada: $${fine}`,
      );

      // Notificar por correo
      if (store.owner?.email) {
        await this.mailService.sendStoreSuspendedForCommissions(
          store.owner.email,
          store.name,
          parseFloat(billing.totalDue.toString()),
          fine,
        );
      }
    }
  }
}
