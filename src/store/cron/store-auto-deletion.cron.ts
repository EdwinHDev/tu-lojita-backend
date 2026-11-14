import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual } from 'typeorm';
import { Store } from '../entities/store.entity';
import { StoreService } from '../store.service';

@Injectable()
export class StoreAutoDeletionCron {
  private readonly logger = new Logger(StoreAutoDeletionCron.name);

  constructor(
    @InjectRepository(Store)
    private readonly storeRepository: Repository<Store>,
    private readonly storeService: StoreService,
  ) {}

  @Cron('0 0 * * *', { timeZone: 'America/Caracas' })
  async handleScheduledStoreDeletions() {
    this.logger.log(
      'Ejecutando revisión de sucursales con baja programada vencida (00:00 VET)...',
    );

    const now = new Date();

    const expiredStores = await this.storeRepository.find({
      where: {
        isDeleted: false,
        deletionScheduledAt: LessThanOrEqual(now),
      },
      relations: ['company'],
    });

    if (expiredStores.length === 0) {
      this.logger.log(
        'No hay sucursales pendientes por eliminar definitivamente.',
      );
      return;
    }

    this.logger.log(
      `Procesando baja definitiva de ${expiredStores.length} sucursal(es)...`,
    );

    for (const store of expiredStores) {
      try {
        const result =
          await this.storeService.executeScheduledDeletionIfEligible(store.id);
        if (result.deleted) {
          this.logger.log(
            `Baja definitiva completada para sucursal: ${store.name} (${store.id})`,
          );
        } else {
          this.logger.warn(
            `Baja definitiva omitida para sucursal ${store.name} (${store.id}): ${result.reason}`,
          );
        }
      } catch (error) {
        this.logger.error(
          `Error al ejecutar baja definitiva de sucursal ${store.id}: ${error.message}`,
        );
      }
    }
  }
}

