import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PlatformSetting } from './entities/platform-setting.entity';

export const PLATFORM_KEYS = {
  MEDIATION_COOLDOWN_DAYS: 'mediation_cooldown_days',
  FRAUD_PENALTY_ENABLED: 'fraud_penalty_enabled',
  MAX_CONSECUTIVE_REJECTIONS: 'max_consecutive_rejections',
  SUSPENSION_DURATION_DAYS: 'suspension_duration_days',
  CONSECUTIVE_RESET_DAYS: 'consecutive_reset_days',
  ALLOW_FREE_RESERVATIONS: 'allow_free_reservations',
  HOLD_TIMEOUT_MINUTES: 'hold_timeout_minutes',
  MAX_PREORDER_LEAD_DAYS: 'max_preorder_lead_days',
  OFFICIAL_SUPPORT_WHATSAPP: 'official_support_whatsapp',
  WHATSAPP_SUPPORT_ENABLED: 'whatsapp_support_enabled',
} as const;

@Injectable()
export class PlatformSettingsService {
  constructor(
    @InjectRepository(PlatformSetting)
    private readonly repo: Repository<PlatformSetting>,
  ) {}

  async onModuleInit() {
    // Seed default values if not present
    const defaults: Record<string, string> = {
      [PLATFORM_KEYS.MEDIATION_COOLDOWN_DAYS]: '7',
      [PLATFORM_KEYS.FRAUD_PENALTY_ENABLED]: 'true',
      [PLATFORM_KEYS.MAX_CONSECUTIVE_REJECTIONS]: '3',
      [PLATFORM_KEYS.SUSPENSION_DURATION_DAYS]: '15',
      [PLATFORM_KEYS.CONSECUTIVE_RESET_DAYS]: '30',
      [PLATFORM_KEYS.ALLOW_FREE_RESERVATIONS]: 'true',
      [PLATFORM_KEYS.HOLD_TIMEOUT_MINUTES]: '15',
      [PLATFORM_KEYS.MAX_PREORDER_LEAD_DAYS]: '60',
      [PLATFORM_KEYS.OFFICIAL_SUPPORT_WHATSAPP]: '',
      [PLATFORM_KEYS.WHATSAPP_SUPPORT_ENABLED]: 'false',
    };

    for (const [key, value] of Object.entries(defaults)) {
      const existing = await this.repo.findOneBy({ key });
      if (!existing) {
        await this.repo.save({ key, value });
      }
    }
  }

  async get(key: string): Promise<string | null> {
    const setting = await this.repo.findOneBy({ key });
    return setting?.value ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    await this.repo.save({ key, value });
  }

  async getCooldownDays(): Promise<number> {
    const val = await this.get(PLATFORM_KEYS.MEDIATION_COOLDOWN_DAYS);
    const parsed = val !== null ? parseInt(val, 10) : NaN;
    return isNaN(parsed) ? 7 : parsed;
  }

  async isFraudPenaltyEnabled(): Promise<boolean> {
    const val = await this.get(PLATFORM_KEYS.FRAUD_PENALTY_ENABLED);
    return val === null ? true : val === 'true';
  }

  async getMaxConsecutiveRejections(): Promise<number> {
    const val = await this.get(PLATFORM_KEYS.MAX_CONSECUTIVE_REJECTIONS);
    const parsed = val !== null ? parseInt(val, 10) : NaN;
    return isNaN(parsed) ? 3 : parsed;
  }

  async getSuspensionDurationDays(): Promise<number> {
    const val = await this.get(PLATFORM_KEYS.SUSPENSION_DURATION_DAYS);
    const parsed = val !== null ? parseInt(val, 10) : NaN;
    return isNaN(parsed) ? 15 : parsed;
  }

  async getConsecutiveResetDays(): Promise<number> {
    const val = await this.get(PLATFORM_KEYS.CONSECUTIVE_RESET_DAYS);
    const parsed = val !== null ? parseInt(val, 10) : NaN;
    return isNaN(parsed) ? 30 : parsed;
  }

  async isAllowFreeReservations(): Promise<boolean> {
    const val = await this.get(PLATFORM_KEYS.ALLOW_FREE_RESERVATIONS);
    return val === null ? true : val === 'true';
  }

  async getHoldTimeoutMinutes(): Promise<number> {
    const val = await this.get(PLATFORM_KEYS.HOLD_TIMEOUT_MINUTES);
    const parsed = val !== null ? parseInt(val, 10) : NaN;
    return isNaN(parsed) ? 15 : parsed;
  }

  async getMaxPreorderLeadDays(): Promise<number> {
    const val = await this.get(PLATFORM_KEYS.MAX_PREORDER_LEAD_DAYS);
    const parsed = val !== null ? parseInt(val, 10) : NaN;
    return isNaN(parsed) ? 60 : parsed;
  }

  async getOfficialSupportWhatsapp(): Promise<string> {
    const val = await this.get(PLATFORM_KEYS.OFFICIAL_SUPPORT_WHATSAPP);
    return val ?? '';
  }

  async isWhatsappSupportEnabled(): Promise<boolean> {
    const val = await this.get(PLATFORM_KEYS.WHATSAPP_SUPPORT_ENABLED);
    return val === 'true';
  }

  async getPublicSettings(): Promise<{
    officialSupportWhatsapp: string;
    whatsappSupportEnabled: boolean;
  }> {
    const [whatsapp, enabled] = await Promise.all([
      this.getOfficialSupportWhatsapp(),
      this.isWhatsappSupportEnabled(),
    ]);
    return {
      officialSupportWhatsapp: whatsapp,
      whatsappSupportEnabled: enabled,
    };
  }

  async findAll(): Promise<PlatformSetting[]> {
    return this.repo.find();
  }
}
