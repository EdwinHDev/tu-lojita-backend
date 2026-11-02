import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ItemService } from '../item.service';

@Injectable()
export class ExpirePromotionsCron {
  private readonly logger = new Logger(ExpirePromotionsCron.name);

  constructor(private readonly itemService: ItemService) {}

  @Cron('*/10 * * * *') // Corre cada 10 minutos
  async handleExpiredPromotions() {
    try {
      const expiredCount = await this.itemService.expireExpiredPromotions();
      if (expiredCount > 0) {
        this.logger.log(`Cron: ${expiredCount} promociones marcadas como expiradas.`);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Error en cron de expiración de promociones: ${message}`);
    }
  }
}

