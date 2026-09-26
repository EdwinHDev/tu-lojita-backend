import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PlatformSetting } from './entities/platform-setting.entity';

export const PLATFORM_KEYS = {
  MEDIATION_COOLDOWN_DAYS: 'mediation_cooldown_days',
} as const;

@Injectable()
export class PlatformSettingsService {
  constructor(
    @InjectRepository(PlatformSetting)
    private readonly repo: Repository<PlatformSetting>,
  ) {}

  async onModuleInit() {
    // Seed default values if not present
    const existing = await this.repo.findOneBy({
      key: PLATFORM_KEYS.MEDIATION_COOLDOWN_DAYS,
    });
    if (!existing) {
      await this.repo.save({ key: PLATFORM_KEYS.MEDIATION_COOLDOWN_DAYS, value: '7' });
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

  async findAll(): Promise<PlatformSetting[]> {
    return this.repo.find();
  }
}
