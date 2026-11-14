import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PlatformSetting } from './entities/platform-setting.entity';
import { PriceType } from 'src/item/types/price-type.enum';

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
  FEATURED_SECTION_ENABLED: 'featured_section_enabled',
  FEATURED_SECTION_TITLE: 'featured_section_title',
  FEATURED_CAROUSEL_SECONDS: 'featured_carousel_seconds',
  FEATURED_MAX_ITEMS: 'featured_max_items',
  FEATURED_FILL_BESTSELLERS: 'featured_fill_bestsellers',
  FEATURED_PRICE_PER_DAY: 'featured_price_per_day',
  BCV_RATE_ENABLED: 'bcv_rate_enabled',
  BCV_RATE_MODE: 'bcv_rate_mode',
  BCV_RATE_MANUAL_VALUE: 'bcv_rate_manual_value',
  BCV_RATE_CACHED_VALUE: 'bcv_rate_cached_value',
  BCV_RATE_LAST_SYNC: 'bcv_rate_last_sync',
  AI_IMAGE_ENHANCEMENT_ENABLED: 'ai_image_enhancement_enabled',
  AI_GEMINI_MODEL: 'ai_gemini_model',
  ITEM_ENABLED_PRICE_TYPES: 'item_enabled_price_types',
  CRM_OFFER_SERVICE_ENABLED: 'crm_offer_service_enabled',
  CRM_OFFER_FEE_PER_CAMPAIGN: 'crm_offer_fee_per_campaign',
} as const;

export const DEFAULT_AI_GEMINI_MODEL = 'gemini-2.5-flash-image';

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
      [PLATFORM_KEYS.FEATURED_SECTION_ENABLED]: 'true',
      [PLATFORM_KEYS.FEATURED_SECTION_TITLE]: 'Artículos Destacados',
      [PLATFORM_KEYS.FEATURED_CAROUSEL_SECONDS]: '5',
      [PLATFORM_KEYS.FEATURED_MAX_ITEMS]: '10',
      [PLATFORM_KEYS.FEATURED_FILL_BESTSELLERS]: 'true',
      [PLATFORM_KEYS.FEATURED_PRICE_PER_DAY]: '2.00',
      [PLATFORM_KEYS.BCV_RATE_ENABLED]: 'true',
      [PLATFORM_KEYS.BCV_RATE_MODE]: 'AUTO',
      [PLATFORM_KEYS.BCV_RATE_MANUAL_VALUE]: '50.00',
      [PLATFORM_KEYS.BCV_RATE_CACHED_VALUE]: '50.00',
      [PLATFORM_KEYS.BCV_RATE_LAST_SYNC]: new Date().toISOString(),
      [PLATFORM_KEYS.AI_IMAGE_ENHANCEMENT_ENABLED]: 'true',
      [PLATFORM_KEYS.AI_GEMINI_MODEL]: DEFAULT_AI_GEMINI_MODEL,
      [PLATFORM_KEYS.ITEM_ENABLED_PRICE_TYPES]:
        'FIXED,STARTING_AT,NEGOTIABLE,ON_DEMAND,FREE',
      [PLATFORM_KEYS.CRM_OFFER_SERVICE_ENABLED]: 'true',
      [PLATFORM_KEYS.CRM_OFFER_FEE_PER_CAMPAIGN]: '1.00',
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

  async getFeaturedShowcaseConfig(): Promise<{
    enabled: boolean;
    title: string;
    carouselSeconds: number;
    maxItems: number;
    fillWithBestSellers: boolean;
    pricePerDay: number;
  }> {
    const [enabled, title, seconds, maxItems, fill, price] = await Promise.all([
      this.get(PLATFORM_KEYS.FEATURED_SECTION_ENABLED),
      this.get(PLATFORM_KEYS.FEATURED_SECTION_TITLE),
      this.get(PLATFORM_KEYS.FEATURED_CAROUSEL_SECONDS),
      this.get(PLATFORM_KEYS.FEATURED_MAX_ITEMS),
      this.get(PLATFORM_KEYS.FEATURED_FILL_BESTSELLERS),
      this.get(PLATFORM_KEYS.FEATURED_PRICE_PER_DAY),
    ]);

    return {
      enabled: enabled !== 'false',
      title: title || 'Artículos Destacados',
      carouselSeconds: seconds ? Math.max(1, parseInt(seconds, 10)) : 5,
      maxItems: maxItems ? Math.max(1, parseInt(maxItems, 10)) : 10,
      fillWithBestSellers: fill !== 'false',
      pricePerDay: price ? parseFloat(price) : 2.0,
    };
  }

  async getExchangeRateConfig(): Promise<{
    enabled: boolean;
    rate: number;
    currency: string;
    symbol: string;
    source: string;
    mode: 'AUTO' | 'MANUAL';
    updatedAt: string;
  }> {
    const [enabledStr, mode, manualStr, cachedStr, lastSync] = await Promise.all([
      this.get(PLATFORM_KEYS.BCV_RATE_ENABLED),
      this.get(PLATFORM_KEYS.BCV_RATE_MODE),
      this.get(PLATFORM_KEYS.BCV_RATE_MANUAL_VALUE),
      this.get(PLATFORM_KEYS.BCV_RATE_CACHED_VALUE),
      this.get(PLATFORM_KEYS.BCV_RATE_LAST_SYNC),
    ]);

    const isEnabled = enabledStr !== 'false';
    const activeMode = mode === 'MANUAL' ? 'MANUAL' : 'AUTO';
    const manualRate = manualStr ? parseFloat(manualStr) : 50.0;
    const cachedRate = cachedStr ? parseFloat(cachedStr) : 50.0;
    const activeRate = activeMode === 'MANUAL' ? manualRate : (cachedRate || manualRate);

    return {
      enabled: isEnabled,
      rate: activeRate > 0 ? activeRate : 50.0,
      currency: 'VES',
      symbol: 'Bs.',
      source: activeMode === 'MANUAL' ? 'MANUAL' : 'BCV',
      mode: activeMode,
      updatedAt: lastSync || new Date().toISOString(),
    };
  }

  async isAiImageEnhancementEnabled(): Promise<boolean> {
    const val = await this.get(PLATFORM_KEYS.AI_IMAGE_ENHANCEMENT_ENABLED);
    return val === null ? true : val === 'true';
  }

  async getAiGeminiModel(): Promise<string> {
    const val = await this.get(PLATFORM_KEYS.AI_GEMINI_MODEL);
    const trimmed = val?.trim();
    return trimmed && trimmed.length > 0 ? trimmed : DEFAULT_AI_GEMINI_MODEL;
  }

  async getAiImageGovernanceConfig(): Promise<{
    enabled: boolean;
    model: string;
  }> {
    const [enabled, model] = await Promise.all([
      this.isAiImageEnhancementEnabled(),
      this.getAiGeminiModel(),
    ]);
    return { enabled, model };
  }

  async getEnabledPriceTypes(): Promise<PriceType[]> {
    const raw = await this.get(PLATFORM_KEYS.ITEM_ENABLED_PRICE_TYPES);
    const validValues = new Set<string>(Object.values(PriceType));
    if (!raw || raw.trim().length === 0) {
      return Object.values(PriceType);
    }
    const parsed = raw
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .filter((s): s is PriceType => validValues.has(s));
    if (!parsed.includes(PriceType.FIXED)) {
      parsed.unshift(PriceType.FIXED);
    }
    return Array.from(new Set(parsed));
  }

  async setEnabledPriceTypes(types: PriceType[]): Promise<PriceType[]> {
    const validValues = new Set<string>(Object.values(PriceType));
    const normalized = Array.from(
      new Set([
        PriceType.FIXED,
        ...(types || [])
          .map((t) => String(t).trim().toUpperCase())
          .filter((t): t is PriceType => validValues.has(t)),
      ]),
    );
    await this.set(PLATFORM_KEYS.ITEM_ENABLED_PRICE_TYPES, normalized.join(','));
    return normalized;
  }

  private priceTypesGovernanceHandler?: {
    getStatus: () => Promise<any>;
    updateAndCascade: (types: PriceType[], adminUser?: any) => Promise<any>;
  };

  registerPriceTypesGovernanceHandler(handler: {
    getStatus: () => Promise<any>;
    updateAndCascade: (types: PriceType[], adminUser?: any) => Promise<any>;
  }) {
    this.priceTypesGovernanceHandler = handler;
  }

  async getPriceTypesGovernanceStatus() {
    if (!this.priceTypesGovernanceHandler) {
      const enabledPriceTypes = await this.getEnabledPriceTypes();
      return { enabledPriceTypes, items: [] };
    }
    return this.priceTypesGovernanceHandler.getStatus();
  }

  async updateEnabledPriceTypesAndCascade(types: PriceType[], adminUser?: any) {
    if (!this.priceTypesGovernanceHandler) {
      const enabledPriceTypes = await this.setEnabledPriceTypes(types);
      return {
        enabledPriceTypes,
        items: [],
        cascadeResult: {
          unpublishedItemsCount: 0,
          notifiedStoresCount: 0,
          affectedStores: [],
        },
      };
    }
    return this.priceTypesGovernanceHandler.updateAndCascade(types, adminUser);
  }

  async getCrmOfferConfig(): Promise<{
    enabled: boolean;
    feePerCampaign: number;
  }> {
    const [enabledStr, feeStr] = await Promise.all([
      this.get(PLATFORM_KEYS.CRM_OFFER_SERVICE_ENABLED),
      this.get(PLATFORM_KEYS.CRM_OFFER_FEE_PER_CAMPAIGN),
    ]);
    const parsedFee = parseFloat(feeStr || '1.00');
    return {
      enabled: enabledStr !== 'false',
      feePerCampaign:
        !Number.isNaN(parsedFee) && parsedFee >= 0
          ? Number(parsedFee.toFixed(2))
          : 1.0,
    };
  }

  async setCrmOfferConfig(config: {
    enabled?: boolean;
    feePerCampaign?: number;
  }): Promise<{ enabled: boolean; feePerCampaign: number }> {
    if (config.enabled !== undefined) {
      await this.set(
        PLATFORM_KEYS.CRM_OFFER_SERVICE_ENABLED,
        config.enabled ? 'true' : 'false',
      );
    }
    if (config.feePerCampaign !== undefined) {
      const fee = Number(config.feePerCampaign);
      if (!Number.isNaN(fee) && fee >= 0) {
        await this.set(PLATFORM_KEYS.CRM_OFFER_FEE_PER_CAMPAIGN, fee.toFixed(2));
      }
    }
    return this.getCrmOfferConfig();
  }

  async getPublicSettings(): Promise<{
    officialSupportWhatsapp: string;
    whatsappSupportEnabled: boolean;
    featuredShowcase: {
      enabled: boolean;
      title: string;
      carouselSeconds: number;
      maxItems: number;
      fillWithBestSellers: boolean;
      pricePerDay: number;
    };
    exchangeRate: {
      enabled: boolean;
      rate: number;
      currency: string;
      symbol: string;
      source: string;
      mode: 'AUTO' | 'MANUAL';
      updatedAt: string;
    };
    aiImageEnhancement: {
      enabled: boolean;
    };
    enabledPriceTypes: PriceType[];
    crmOffer: {
      enabled: boolean;
      feePerCampaign: number;
    };
  }> {
    const [
      whatsapp,
      enabled,
      featuredShowcase,
      exchangeRate,
      aiEnabled,
      enabledPriceTypes,
      crmOffer,
    ] = await Promise.all([
      this.getOfficialSupportWhatsapp(),
      this.isWhatsappSupportEnabled(),
      this.getFeaturedShowcaseConfig(),
      this.getExchangeRateConfig(),
      this.isAiImageEnhancementEnabled(),
      this.getEnabledPriceTypes(),
      this.getCrmOfferConfig(),
    ]);
    return {
      officialSupportWhatsapp: whatsapp,
      whatsappSupportEnabled: enabled,
      featuredShowcase,
      exchangeRate,
      aiImageEnhancement: {
        enabled: aiEnabled,
      },
      enabledPriceTypes,
      crmOffer,
    };
  }

  async findAll(): Promise<PlatformSetting[]> {
    return this.repo.find();
  }
}
