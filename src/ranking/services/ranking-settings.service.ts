import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RankingSettings } from '../entities/ranking-settings.entity';
import {
  DEFAULT_RANKING_SETTINGS,
  RankingSettingsData,
  Division,
} from '../types';

@Injectable()
export class RankingSettingsService {
  private readonly logger = new Logger(RankingSettingsService.name);
  private cachedSettings: RankingSettingsData | null = null;
  private cacheExpiresAt: number = 0;
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes TTL

  constructor(
    @InjectRepository(RankingSettings)
    private readonly settingsRepository: Repository<RankingSettings>,
  ) {}

  async getSettings(): Promise<RankingSettingsData> {
    const now = Date.now();
    if (this.cachedSettings && now < this.cacheExpiresAt) {
      return this.cachedSettings;
    }

    const records = await this.settingsRepository.find({
      order: { createdAt: 'ASC' },
      take: 1,
    });
    let record = records[0];

    if (!record) {
      record = this.settingsRepository.create({
        ...DEFAULT_RANKING_SETTINGS,
      });
      record = await this.settingsRepository.save(record);
      this.logger.log('Initialized default ranking_settings in DB.');
    }

    const data: RankingSettingsData = {
      lpValues: {
        ...DEFAULT_RANKING_SETTINGS.lpValues,
        ...(record.lpValues || {}),
      },
      divisionThresholds: {
        ...DEFAULT_RANKING_SETTINGS.divisionThresholds,
        ...(record.divisionThresholds || {}),
      },
      calibration: {
        ...DEFAULT_RANKING_SETTINGS.calibration,
        ...(record.calibration || {}),
      },
      antiCheat: {
        ...DEFAULT_RANKING_SETTINGS.antiCheat,
        ...(record.antiCheat || {}),
      },
      inactivity: {
        ...DEFAULT_RANKING_SETTINGS.inactivity,
        ...(record.inactivity || {}),
      },
      maestro: {
        ...DEFAULT_RANKING_SETTINGS.maestro,
        ...(record.maestro || {}),
      },
      divisionEmblems: {
        ...DEFAULT_RANKING_SETTINGS.divisionEmblems,
        ...(record.divisionEmblems || {}),
      },
      divisionFrames: {
        ...(DEFAULT_RANKING_SETTINGS.divisionFrames || {}),
        ...(record.divisionFrames || {}),
      },
      retention: {
        ...DEFAULT_RANKING_SETTINGS.retention,
        ...(record.retention || {}),
      },
      missions: {
        ...DEFAULT_RANKING_SETTINGS.missions,
        ...(record.missions || {}),
      },
    };

    this.cachedSettings = data;
    this.cacheExpiresAt = now + this.CACHE_TTL_MS;
    return data;
  }

  async updateSettings(
    dto: Partial<RankingSettingsData>,
  ): Promise<RankingSettingsData> {
    const records = await this.settingsRepository.find({
      order: { createdAt: 'ASC' },
      take: 1,
    });
    let record = records[0];

    if (!record) {
      record = this.settingsRepository.create({
        ...DEFAULT_RANKING_SETTINGS,
        ...dto,
      });
    } else {
      if (dto.lpValues)
        record.lpValues = { ...record.lpValues, ...dto.lpValues };
      if (dto.divisionThresholds)
        record.divisionThresholds = {
          ...record.divisionThresholds,
          ...dto.divisionThresholds,
        };
      if (dto.calibration)
        record.calibration = { ...record.calibration, ...dto.calibration };
      if (dto.antiCheat)
        record.antiCheat = { ...record.antiCheat, ...dto.antiCheat };
      if (dto.inactivity)
        record.inactivity = { ...record.inactivity, ...dto.inactivity };
      if (dto.maestro) record.maestro = { ...record.maestro, ...dto.maestro };
      if (dto.divisionEmblems)
        record.divisionEmblems = {
          ...record.divisionEmblems,
          ...dto.divisionEmblems,
        };
      if (dto.divisionFrames)
        record.divisionFrames = {
          ...(record.divisionFrames || {}),
          ...dto.divisionFrames,
        };
      if (dto.retention)
        record.retention = {
          ...(record.retention || DEFAULT_RANKING_SETTINGS.retention),
          ...dto.retention,
        };
      if (dto.missions)
        record.missions = {
          ...(record.missions || DEFAULT_RANKING_SETTINGS.missions),
          ...dto.missions,
        };
    }

    await this.settingsRepository.save(record);

    // Invalidate cache immediately
    this.cachedSettings = null;
    this.cacheExpiresAt = 0;

    return this.getSettings();
  }

  async getEmblemUrl(division: Division): Promise<string> {
    const settings = await this.getSettings();
    return (
      settings.divisionEmblems[division] ||
      DEFAULT_RANKING_SETTINGS.divisionEmblems[division] ||
      ''
    );
  }

  async updateDivisionEmblem(
    division: Division,
    imageUrl: string,
  ): Promise<RankingSettingsData> {
    const current = await this.getSettings();
    const defaultPath = `/assets/ranking/emblems/${division.toLowerCase()}.png`;
    const finalUrl =
      !imageUrl || imageUrl.trim() === '' ? defaultPath : imageUrl.trim();
    const updatedEmblems = {
      ...current.divisionEmblems,
      [division]: finalUrl,
    };
    return this.updateSettings({ divisionEmblems: updatedEmblems });
  }

  async getFrameUrl(division: Division): Promise<string> {
    const settings = await this.getSettings();
    return (
      settings.divisionFrames?.[division] ||
      DEFAULT_RANKING_SETTINGS.divisionFrames?.[division] ||
      ''
    );
  }

  async updateDivisionFrame(
    division: Division,
    imageUrl: string,
  ): Promise<RankingSettingsData> {
    const current = await this.getSettings();
    const defaultPath = `/assets/ranking/frames/${division.toLowerCase()}.png`;
    const finalUrl =
      !imageUrl || imageUrl.trim() === '' ? defaultPath : imageUrl.trim();
    const updatedFrames = {
      ...(current.divisionFrames || {}),
      [division]: finalUrl,
    };
    return this.updateSettings({ divisionFrames: updatedFrames });
  }

  clearCache(): void {
    this.cachedSettings = null;
    this.cacheExpiresAt = 0;
  }
}
