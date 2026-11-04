import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import * as https from 'https';
import { PlatformSettingsService, PLATFORM_KEYS } from './platform-settings.service';

@Injectable()
export class ExchangeRateSyncService implements OnModuleInit {
  private readonly logger = new Logger(ExchangeRateSyncService.name);

  constructor(private readonly settingsService: PlatformSettingsService) {}

  async onModuleInit() {
    // Initial sync on boot (non-blocking)
    this.syncExchangeRate().catch((err) => {
      this.logger.warn(`Initial exchange rate sync failed: ${err.message}`);
    });
  }

  // Poll hourly
  @Cron(CronExpression.EVERY_HOUR)
  async handleHourlyCron() {
    await this.syncExchangeRate();
  }

  async syncExchangeRate(): Promise<{ success: boolean; rate: number; source: string; updatedAt: string }> {
    const mode = await this.settingsService.get(PLATFORM_KEYS.BCV_RATE_MODE);
    if (mode === 'MANUAL') {
      const manualStr = await this.settingsService.get(PLATFORM_KEYS.BCV_RATE_MANUAL_VALUE);
      const manualVal = manualStr ? parseFloat(manualStr) : 50.0;
      this.logger.log(`Exchange rate is configured in MANUAL mode: ${manualVal} Bs/$`);
      const now = new Date().toISOString();
      await this.settingsService.set(PLATFORM_KEYS.BCV_RATE_LAST_SYNC, now);
      return { success: true, rate: manualVal, source: 'MANUAL', updatedAt: now };
    }

    try {
      this.logger.log('Fetching official BCV exchange rate from dolarapi.com...');
      const result = await this.fetchRateFromDolarApi();
      if (result && result > 0) {
        const now = new Date().toISOString();
        await Promise.all([
          this.settingsService.set(PLATFORM_KEYS.BCV_RATE_CACHED_VALUE, result.toFixed(4)),
          this.settingsService.set(PLATFORM_KEYS.BCV_RATE_LAST_SYNC, now),
        ]);
        this.logger.log(`Successfully synced BCV rate: ${result.toFixed(4)} Bs/$`);
        return { success: true, rate: result, source: 'BCV', updatedAt: now };
      }
    } catch (err: any) {
      this.logger.warn(`Failed to fetch rate from dolarapi.com: ${err.message}. Falling back to cached/manual rate.`);
    }

    // Fallback: Read cached or manual
    const cachedStr = await this.settingsService.get(PLATFORM_KEYS.BCV_RATE_CACHED_VALUE);
    const manualStr = await this.settingsService.get(PLATFORM_KEYS.BCV_RATE_MANUAL_VALUE);
    const lastSync = await this.settingsService.get(PLATFORM_KEYS.BCV_RATE_LAST_SYNC);
    const fallbackRate = cachedStr ? parseFloat(cachedStr) : (manualStr ? parseFloat(manualStr) : 50.0);
    return {
      success: false,
      rate: fallbackRate,
      source: 'FALLBACK',
      updatedAt: lastSync || new Date().toISOString(),
    };
  }

  private fetchRateFromDolarApi(): Promise<number | null> {
    return new Promise((resolve) => {
      const req = https.get(
        'https://ve.dolarapi.com/v1/dolares/oficial',
        { timeout: 8000, headers: { 'User-Agent': 'TuLojitaBackend/1.0' } },
        (res) => {
          if (res.statusCode !== 200) {
            resolve(null);
            return;
          }
          let raw = '';
          res.on('data', (chunk) => (raw += chunk));
          res.on('end', () => {
            try {
              const body = JSON.parse(raw);
              const rate =
                typeof body.promedio === 'number' && body.promedio > 0
                  ? body.promedio
                  : typeof body.venta === 'number' && body.venta > 0
                  ? body.venta
                  : null;
              resolve(rate);
            } catch {
              resolve(null);
            }
          });
        },
      );
      req.on('error', () => resolve(null));
      req.on('timeout', () => {
        req.destroy();
        resolve(null);
      });
    });
  }
}

