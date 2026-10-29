import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { BookingService } from '../booking.service';

@Injectable()
export class ReleaseExpiredBookingHoldsCron {
  private readonly logger = new Logger(ReleaseExpiredBookingHoldsCron.name);

  constructor(private readonly bookingService: BookingService) {}

  @Cron('*/5 * * * *') // Corre cada 5 minutos
  async handleExpiredHolds() {
    try {
      const released = await this.bookingService.releaseExpiredHolds();
      if (released > 0) {
        this.logger.log(
          `Cron: Liberados ${released} turnos con hold expirado.`,
        );
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Error en cron de liberación de turnos: ${message}`);
    }
  }
}
