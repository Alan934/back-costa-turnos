import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { HOLIDAYS_ZONE, HolidaysService } from './holidays.service';

/**
 * Mantiene el catálogo de feriados al día contra la API pública de argentinadatos.com.
 *
 * - Cron mensual (día 1, 04:00 hora argentina): re-sincroniza el año actual y el siguiente. La API
 *   publica el año completo de una vez, así que una vez al mes alcanza para tomar los cambios por
 *   decreto (feriados puente, traslados) y para tener enero listo desde diciembre.
 * - Al iniciar: si falta algún año en la base lo carga, para no depender del cron tras un deploy
 *   nuevo (la tabla arranca vacía). No bloquea el arranque ni lo rompe si la API está caída.
 */
@Injectable()
export class HolidaysJobs implements OnApplicationBootstrap {
  private readonly logger = new Logger(HolidaysJobs.name);

  constructor(private readonly holidays: HolidaysService) {}

  onApplicationBootstrap(): void {
    // En tests no se sale a internet.
    if (process.env.NODE_ENV === 'test') return;
    this.holidays.ensureLoaded().catch((err: Error) => {
      this.logger.error(`Carga inicial de feriados falló: ${err.message}`);
    });
  }

  @Cron('0 4 1 * *', { timeZone: HOLIDAYS_ZONE })
  async monthlySync(): Promise<void> {
    this.logger.log('Sincronizando feriados (cron mensual)');
    await this.holidays.syncCurrentAndNextYear();
  }
}
