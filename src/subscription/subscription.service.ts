import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CompanySubscription } from './entities/company-subscription.entity';
import { SubscriptionPayment } from './entities/subscription-payment.entity';
import { SubscriptionSettings } from './entities/subscription-settings.entity';
import { PlatformPaymentMethod } from 'src/commission/entities/platform-payment-method.entity';
import { Company } from 'src/company/entities/company.entity';
import { Store } from 'src/store/entities/store.entity';
import { StoreStatus } from 'src/store/types/status.enum';
import { User } from 'src/user/entities/user.entity';
import { SubscriptionStatus, SubscriptionPaymentStatus } from './types';
import { MailService } from 'src/common/mail/mail.service';
import { NotificationService } from 'src/notification/notification.service';
import { Optional } from '@nestjs/common';

@Injectable()
export class CompanySubscriptionService {
  private readonly logger = new Logger(CompanySubscriptionService.name);

  constructor(
    @InjectRepository(CompanySubscription)
    private readonly subscriptionRepository: Repository<CompanySubscription>,
    @InjectRepository(SubscriptionPayment)
    private readonly paymentRepository: Repository<SubscriptionPayment>,
    @InjectRepository(SubscriptionSettings)
    private readonly settingsRepository: Repository<SubscriptionSettings>,
    @InjectRepository(PlatformPaymentMethod)
    private readonly paymentMethodRepository: Repository<PlatformPaymentMethod>,
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
    @InjectRepository(Store)
    private readonly storeRepository: Repository<Store>,
    private readonly mailService: MailService,
    @Optional()
    private readonly notificationService?: NotificationService,
  ) {}

  async getSettings(): Promise<SubscriptionSettings> {
    let settings = await this.settingsRepository.findOne({ where: {} });
    if (!settings) {
      settings = this.settingsRepository.create({
        monthlyFee: 20.0,
        gracePeriodDays: 3,
        lateFee: 5.0,
      });
      await this.settingsRepository.save(settings);
    }
    return settings;
  }

  async updateSettings(
    dto: Partial<SubscriptionSettings>,
  ): Promise<SubscriptionSettings> {
    const settings = await this.getSettings();
    Object.assign(settings, dto);
    return this.settingsRepository.save(settings);
  }

  async getSubscriptionForUser(user: User): Promise<{
    subscription: CompanySubscription;
    hasActiveSubscription: boolean;
    requiresPayment: boolean;
    pendingVerification: boolean;
    isPaymentRejected: boolean;
    lastRejectionReason: string | null;
  }> {
    // 1. Buscar la empresa del usuario (relación directa o por owner)
    let company: Company | null | undefined = user.company;
    if (!company) {
      company = await this.companyRepository.findOne({
        where: { owner: { id: user.id } },
      });
    }

    let subscription = await this.subscriptionRepository.findOne({
      where: [
        { owner: { id: user.id } },
        ...(company ? [{ company: { id: company.id } }] : []),
      ],
      relations: ['company', 'owner', 'payments', 'payments.paymentMethod'],
      order: { createdAt: 'DESC' },
    });

    if (!subscription) {
      const settings = await this.getSettings();
      subscription = this.subscriptionRepository.create({
        owner: user,
        company: company || null,
        monthlyFee: settings.monthlyFee,
        status: SubscriptionStatus.PAYMENT_REQUIRED,
      });
      subscription = await this.subscriptionRepository.save(subscription);
    } else if (
      company &&
      (!subscription.company || subscription.company.id !== company.id)
    ) {
      // Auto-reparación: Vincular la empresa si no estaba asignada
      subscription.company = company;
      await this.subscriptionRepository.save(subscription);
    }

    const hasActiveSubscription =
      subscription.status === SubscriptionStatus.ACTIVE ||
      subscription.status === SubscriptionStatus.GRACE_PERIOD;

    const requiresPayment =
      subscription.status === SubscriptionStatus.PAYMENT_REQUIRED ||
      subscription.status === SubscriptionStatus.SUSPENDED;

    const pendingVerification =
      subscription.status === SubscriptionStatus.PENDING_VERIFICATION;

    // Evaluar si el último comprobante enviado fue rechazado
    const sortedPayments = (subscription.payments || [])
      .slice()
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
    const latestPayment = sortedPayments[0];

    const isPaymentRejected =
      subscription.status === SubscriptionStatus.PAYMENT_REQUIRED &&
      latestPayment?.status === SubscriptionPaymentStatus.REJECTED;

    const lastRejectionReason = isPaymentRejected
      ? latestPayment.rejectionReason ||
        'El comprobante o los datos suministrados no concuerdan con los registros bancarios.'
      : null;

    return {
      subscription,
      hasActiveSubscription,
      requiresPayment,
      pendingVerification,
      isPaymentRejected,
      lastRejectionReason,
    };
  }

  async reportPayment(
    user: User,
    dto: {
      amount: number;
      paymentMethodId: string;
      referenceNumber: string;
      receiptImageUrl: string;
    },
  ) {
    const { subscription } = await this.getSubscriptionForUser(user);

    // Asegurar que si el usuario tiene empresa, la suscripción tenga la empresa asignada
    if (!subscription.company) {
      const company =
        user.company ||
        (await this.companyRepository.findOne({
          where: { owner: { id: user.id } },
        }));
      if (company) {
        subscription.company = company;
        await this.subscriptionRepository.save(subscription);
      }
    }

    const paymentMethod = await this.paymentMethodRepository.findOne({
      where: { id: dto.paymentMethodId },
    });
    if (!paymentMethod) {
      throw new NotFoundException(
        'Método de pago de la plataforma no encontrado',
      );
    }

    const payment = this.paymentRepository.create({
      subscription,
      subscriptionId: subscription.id,
      amount: dto.amount,
      paymentMethod,
      paymentMethodId: paymentMethod.id,
      referenceNumber: dto.referenceNumber,
      receiptImageUrl: dto.receiptImageUrl,
      status: SubscriptionPaymentStatus.PENDING_VERIFICATION,
    });
    const savedPayment = await this.paymentRepository.save(payment);

    // Actualizar el estado de la suscripción a PENDING_VERIFICATION usando update para no desvincular relaciones de pagos
    subscription.status = SubscriptionStatus.PENDING_VERIFICATION;
    await this.subscriptionRepository.update(subscription.id, {
      status: SubscriptionStatus.PENDING_VERIFICATION,
    });

    // Notificar al panel admin en tiempo real que hay una empresa con pago por validar
    const compName = subscription.company?.name || 'Comercio';
    const compId = subscription.company?.id || '';
    this.notificationService?.notifyAdminActionRequired({
      type: 'SUBSCRIPTION_PAYMENT_PENDING',
      title: 'Validación de pago de membresía',
      message: `La empresa "${compName}" reportó pago de membresía por $${Number(dto.amount).toFixed(2)} USD`,
      entityId: compId,
      link: '/subscriptions',
      metadata: {
        paymentId: savedPayment.id,
        referenceNumber: dto.referenceNumber,
        companyId: compId,
        amount: dto.amount,
      },
    });

    // Notificar al panel admin que el contador de pendientes se incrementó
    this.notificationService?.notifyAdminBadgesChanged();

    const userName = `${user.firstName}${user.lastName ? ' ' + user.lastName : ''}`;
    await this.mailService.sendSubscriptionReceiptReceived(
      user.email,
      userName,
    );

    return savedPayment;
  }

  // ----------------------------------------------------
  // RUTAS ADMINISTRATIVAS (ADMIN)
  // ----------------------------------------------------
  async getAllSubscriptions() {
    return this.subscriptionRepository.find({
      relations: ['company', 'owner', 'payments'],
      order: { createdAt: 'DESC' },
    });
  }

  async getPendingPayments() {
    return this.paymentRepository.find({
      where: { status: SubscriptionPaymentStatus.PENDING_VERIFICATION },
      relations: [
        'subscription',
        'subscription.company',
        'subscription.owner',
        'paymentMethod',
      ],
      order: { createdAt: 'ASC' },
    });
  }

  async reviewPayment(
    paymentId: string,
    action: { status: SubscriptionPaymentStatus; rejectionReason?: string },
    reviewer: User,
  ) {
    const payment = await this.paymentRepository.findOne({
      where: { id: paymentId },
      relations: ['subscription', 'subscription.owner', 'subscription.company'],
    });
    if (!payment)
      throw new NotFoundException('Comprobante de pago no encontrado');

    if (!payment.subscription) {
      // Auto-sanación: intentar recuperar la suscripción si no estaba vinculada
      let recoveredSub: CompanySubscription | null = null;
      if (payment.subscriptionId) {
        recoveredSub = await this.subscriptionRepository.findOne({
          where: { id: payment.subscriptionId },
          relations: ['owner', 'company'],
        });
      }
      if (!recoveredSub) {
        recoveredSub = await this.subscriptionRepository.findOne({
          where: { status: SubscriptionStatus.PENDING_VERIFICATION },
          relations: ['owner', 'company'],
          order: { updatedAt: 'DESC' },
        });
      }

      if (recoveredSub) {
        payment.subscription = recoveredSub;
        payment.subscriptionId = recoveredSub.id;
        await this.paymentRepository.update(payment.id, {
          subscriptionId: recoveredSub.id,
        });
      } else {
        throw new BadRequestException(
          'El comprobante de pago no tiene una suscripción empresarial asociada.',
        );
      }
    }

    payment.status = action.status;
    payment.rejectionReason = action.rejectionReason || null;
    payment.reviewedBy = reviewer;
    payment.reviewedAt = new Date();
    await this.paymentRepository.save(payment);

    const subscription = payment.subscription;

    if (action.status === SubscriptionPaymentStatus.APPROVED) {
      const now = new Date();
      const periodEnd = new Date(now);
      periodEnd.setDate(periodEnd.getDate() + 30); // 30 días de suscripción

      const graceEnd = new Date(periodEnd);
      graceEnd.setDate(graceEnd.getDate() + 3); // 3 días de gracia

      await this.subscriptionRepository.update(subscription.id, {
        status: SubscriptionStatus.ACTIVE,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        gracePeriodEnd: graceEnd,
        accumulatedDebt: 0,
        nextBillingDate: periodEnd,
      });

      // Reactivar tiendas asociadas si estaban suspendidas usando QueryBuilder seguro
      if (subscription.company?.id) {
        await this.storeRepository
          .createQueryBuilder()
          .update(Store)
          .set({ status: StoreStatus.ACTIVE })
          .where('"companyId" = :companyId AND status = :status', {
            companyId: subscription.company.id,
            status: StoreStatus.SUSPENDED,
          })
          .execute();
      }

      // Resolver datos del propietario de forma segura para el envío de correo
      const owner =
        subscription.owner ||
        (subscription.company?.id
          ? (
              await this.companyRepository.findOne({
                where: { id: subscription.company.id },
                relations: ['owner'],
              })
            )?.owner
          : null);

      if (owner && owner.email) {
        const userName = `${owner.firstName || 'Comercio'}${owner.lastName ? ' ' + owner.lastName : ''}`;
        await this.mailService.sendSubscriptionActivated(
          owner.email,
          userName,
          periodEnd,
        );
      }
    } else {
      // 1. Resolver datos del propietario para enviar correo de rechazo
      const owner =
        subscription.owner ||
        (subscription.company?.id
          ? (
              await this.companyRepository.findOne({
                where: { id: subscription.company.id },
                relations: ['owner'],
              })
            )?.owner
          : null);

      if (owner && owner.email) {
        const userName = `${owner.firstName || 'Comercio'}${owner.lastName ? ' ' + owner.lastName : ''}`;
        await this.mailService.sendSubscriptionRejected(
          owner.email,
          userName,
          action.rejectionReason ||
            'El comprobante o los datos suministrados no concuerdan con los registros bancarios.',
        );
      }

      // 2. Establecer estado de pago requerido sin borrar la empresa ni sus tiendas
      subscription.status = SubscriptionStatus.PAYMENT_REQUIRED;
      await this.subscriptionRepository.save(subscription);

      this.logger.log(
        `Subscription payment ${payment.id} rejected. Company ${subscription.company?.id} retained in PAYMENT_REQUIRED state.`,
      );
    }

    // Notificar al panel admin en tiempo real que cambiaron las empresas pendientes
    this.notificationService?.notifyAdminBadgesChanged();

    return payment;
  }

  async resetTestData() {
    // 1. Eliminar todos los reportes de pago de suscripción
    await this.paymentRepository.createQueryBuilder().delete().execute();

    // 2. Restablecer todas las suscripciones a PAYMENT_REQUIRED
    await this.subscriptionRepository
      .createQueryBuilder()
      .update(CompanySubscription)
      .set({
        status: SubscriptionStatus.PAYMENT_REQUIRED,
        currentPeriodStart: null,
        currentPeriodEnd: null,
        gracePeriodEnd: null,
        nextBillingDate: null,
        accumulatedDebt: 0,
      })
      .execute();

    this.logger.log(
      'Reset test data: All subscription payments deleted and subscriptions set to PAYMENT_REQUIRED',
    );
    return {
      success: true,
      message:
        'Todos los pagos de suscripción han sido eliminados y las suscripciones restablecidas a PAGO REQUERIDO.',
    };
  }

  async getSubscriptionMetrics() {
    const activeCount = await this.subscriptionRepository.count({
      where: { status: SubscriptionStatus.ACTIVE },
    });
    const pendingCount = await this.subscriptionRepository.count({
      where: { status: SubscriptionStatus.PENDING_VERIFICATION },
    });
    const suspendedCount = await this.subscriptionRepository.count({
      where: { status: SubscriptionStatus.SUSPENDED },
    });

    const settings = await this.getSettings();
    const fee = parseFloat(settings.monthlyFee.toString());
    const mrr = activeCount * fee;

    return {
      activeCount,
      pendingCount,
      suspendedCount,
      monthlyFee: fee,
      mrr,
      projection6Months: mrr * 6,
      projection12Months: mrr * 12,
    };
  }
}
