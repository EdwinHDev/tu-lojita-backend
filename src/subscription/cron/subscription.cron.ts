import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual } from 'typeorm';
import { CompanySubscription } from '../entities/company-subscription.entity';
import { SubscriptionSettings } from '../entities/subscription-settings.entity';
import { Store } from 'src/store/entities/store.entity';
import { StoreStatus } from 'src/store/types/status.enum';
import { SubscriptionStatus } from '../types';
import { MailService } from 'src/common/mail/mail.service';

@Injectable()
export class SubscriptionCron {
  private readonly logger = new Logger(SubscriptionCron.name);

  constructor(
    @InjectRepository(CompanySubscription)
    private readonly subscriptionRepository: Repository<CompanySubscription>,
    @InjectRepository(SubscriptionSettings)
    private readonly settingsRepository: Repository<SubscriptionSettings>,
    @InjectRepository(Store)
    private readonly storeRepository: Repository<Store>,
    private readonly mailService: MailService,
  ) {}

  @Cron('0 0 * * *', { timeZone: 'America/Caracas' })
  async handleDailySubscriptionChecks() {
    this.logger.log('Ejecutando revisión diaria de suscripciones B2B (00:00 VET)...');

    const now = new Date();
    const settings = await this.settingsRepository.findOne({ where: {} });
    const lateFee = parseFloat(settings?.lateFee?.toString() || '5.00');

    // 1. Suscripciones que han vencido pero aún están en período de gracia
    const activeExpired = await this.subscriptionRepository.find({
      where: {
        status: SubscriptionStatus.ACTIVE,
        currentPeriodEnd: LessThanOrEqual(now),
      },
      relations: ['owner', 'company'],
    });

    for (const sub of activeExpired) {
      sub.status = SubscriptionStatus.GRACE_PERIOD;
      await this.subscriptionRepository.save(sub);
      this.logger.log(`Suscripción de ${sub.owner.email} pasó a período de gracia.`);

      if (sub.owner?.email) {
        await this.mailService.sendSubscriptionGracePeriodNotice(
          sub.owner.email,
          sub.owner.firstName,
          sub.gracePeriodEnd || new Date(now.getTime() + 3 * 86400000),
        );
      }
    }

    // 2. Suscripciones cuyo período de gracia ha expirado -> Suspensión y recargo por mora
    const graceExpired = await this.subscriptionRepository.find({
      where: {
        status: SubscriptionStatus.GRACE_PERIOD,
        gracePeriodEnd: LessThanOrEqual(now),
      },
      relations: ['owner', 'company'],
    });

    for (const sub of graceExpired) {
      sub.status = SubscriptionStatus.SUSPENDED;
      sub.accumulatedDebt = parseFloat(sub.accumulatedDebt?.toString() || '0') + lateFee;
      await this.subscriptionRepository.save(sub);

      // Suspender tiendas asociadas a la empresa
      if (sub.company) {
        await this.storeRepository.update(
          { company: { id: sub.company.id } },
          { status: StoreStatus.SUSPENDED },
        );
      }

      this.logger.warn(
        `Suscripción de ${sub.owner.email} suspendida por vencimiento de gracia. Recargo aplicado: $${lateFee}`,
      );

      if (sub.owner?.email) {
        await this.mailService.sendSubscriptionSuspendedNotice(
          sub.owner.email,
          sub.owner.firstName,
          lateFee,
        );
      }
    }
  }
}
