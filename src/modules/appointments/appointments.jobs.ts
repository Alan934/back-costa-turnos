import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AppointmentsService } from './appointments.service';

/**
 * Housekeeping de reservas pendientes de pago (pending_booking): borra los holds
 * ya vencidos. El hold caduca por expires_at (lazy), esto solo mantiene la tabla
 * chica. Corre cada hora porque los holds son de ~15 min.
 */
@Injectable()
export class AppointmentsJobs {
  private readonly logger = new Logger(AppointmentsJobs.name);

  constructor(private readonly appointments: AppointmentsService) {}

  @Cron(CronExpression.EVERY_HOUR)
  async purgeExpiredHolds(): Promise<void> {
    const deleted = await this.appointments.purgeExpiredHolds();
    if (deleted > 0) this.logger.debug(`pending_booking vencidos borrados: ${deleted}`);
  }
}
