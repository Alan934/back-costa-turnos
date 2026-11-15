import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Between, DataSource, In } from 'typeorm';
import { AppointmentStatus, NotificationType } from '@/common/enums';
import {
  DEFAULT_TIME_ZONE,
  zonedDate,
  zonedDayStart,
  zonedHour,
} from '@/common/zoned-time';
import { Professional } from '@/modules/professionals/entities/professional.entity';
import { Staff } from '@/modules/professionals/entities/staff.entity';
import { Appointment } from '@/modules/appointments/entities/appointment.entity';
import { Person } from '@/modules/identity/entities/person.entity';
import { Service } from '@/modules/catalog/entities/service.entity';
import { Notification } from './entities/notification.entity';
import { NotificationsService } from './notifications.service';

/** Hora local del negocio a la que sale el resumen. */
export const DAILY_SUMMARY_HOUR = 7;

/** Turnos que todavía van a pasar hoy (no los cancelados ni los ausentes). */
const ACTIVE = [
  AppointmentStatus.Requested,
  AppointmentStatus.Confirmed,
  AppointmentStatus.InProgress,
];

export interface DailySummaryItem {
  time: string;
  serviceName: string | null;
  clientName: string;
  clientPhone: string | null;
  staffName: string | null;
  isProvisional: boolean;
}

/**
 * Resumen de la mañana para el profesional: a las 7 (hora de su negocio) le llega por email
 * (y al celular, si activó los avisos) la lista de turnos de hoy. Los días sin turnos no se
 * manda nada. Se apaga desde Configuración (`notificationPrefs.dailySummary = false`).
 */
@Injectable()
export class DailySummaryService {
  private readonly logger = new Logger(DailySummaryService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly notifications: NotificationsService,
  ) {}

  /** Corre cada hora en punto y atiende a los negocios para los que son las 7. */
  @Cron('0 * * * *')
  async run(now: Date = new Date()): Promise<void> {
    const professionals = await this.dataSource.getRepository(Professional).find({
      select: { id: true, timezone: true, notificationPrefs: true },
    });
    for (const pro of professionals) {
      if (pro.notificationPrefs?.dailySummary === false) continue;
      if (zonedHour(now, pro.timezone || DEFAULT_TIME_ZONE) !== DAILY_SUMMARY_HOUR) continue;
      try {
        await this.sendFor(pro.id, now);
      } catch (err) {
        this.logger.warn(`Resumen diario de ${pro.id}: ${String(err)}`);
      }
    }
  }

  /**
   * Arma y envía el resumen de hoy para un profesional. Devuelve cuántos turnos tenía (0 = no
   * se mandó nada). No repite: si ya salió el de hoy, no vuelve a salir.
   */
  async sendFor(professionalId: string, now: Date = new Date()): Promise<number> {
    const professional = await this.dataSource
      .getRepository(Professional)
      .findOne({ where: { id: professionalId } });
    if (!professional) return 0;
    const timezone = professional.timezone || DEFAULT_TIME_ZONE;
    const date = zonedDate(now, timezone);

    const already = await this.dataSource
      .getRepository(Notification)
      .createQueryBuilder('n')
      .where('n.professional_id = :id', { id: professionalId })
      .andWhere('n.type = :type', { type: NotificationType.DailySummary })
      .andWhere(`n.payload->>'date' = :date`, { date })
      .getExists();
    if (already) return 0;

    const dayStart = zonedDayStart(date, timezone);
    const dayEnd = new Date(dayStart.getTime() + 24 * 3_600_000);
    const appointments = await this.dataSource.getRepository(Appointment).find({
      where: {
        professionalId,
        status: In(ACTIVE),
        startAt: Between(dayStart, new Date(dayEnd.getTime() - 1)),
      },
      order: { startAt: 'ASC' },
    });
    const todays = appointments;
    if (todays.length === 0) return 0;

    const [persons, services, staff] = await Promise.all([
      this.dataSource
        .getRepository(Person)
        .find({ where: { id: In([...new Set(todays.map((a) => a.personId))]) } }),
      this.dataSource.getRepository(Service).find({
        where: { id: In([...new Set(todays.map((a) => a.serviceId).filter(Boolean))] as string[]) },
      }),
      this.dataSource.getRepository(Staff).find({ where: { professionalId } }),
    ]);
    // "Con quién" solo aporta si atiende más de una persona.
    const manyStaff = new Set(todays.map((a) => a.staffId)).size > 1;
    const time = new Intl.DateTimeFormat('es-AR', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const items: DailySummaryItem[] = todays.map((a) => {
      const person = persons.find((p) => p.id === a.personId);
      return {
        time: time.format(a.startAt),
        serviceName: services.find((s) => s.id === a.serviceId)?.name ?? null,
        clientName: person?.fullName ?? 'Cliente',
        clientPhone: person?.phone ?? null,
        staffName: manyStaff
          ? (staff.find((s) => s.id === a.staffId)?.displayName ?? null)
          : null,
        isProvisional: a.isProvisional,
      };
    });
    const dayText = new Intl.DateTimeFormat('es-AR', {
      timeZone: timezone,
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }).format(now);

    const count = items.length;
    const first = items[0];
    await this.notifications.notifyProfessional({
      professionalId,
      type: NotificationType.DailySummary,
      payload: { date, dayText, count, items },
      push: {
        title: count === 1 ? 'Hoy tenés 1 turno' : `Hoy tenés ${count} turnos`,
        body: `El primero a las ${first.time}${first.serviceName ? ` · ${first.serviceName}` : ''} · ${first.clientName}`,
        url: '/app/agenda',
        tag: `daily-summary-${date}`,
      },
    });
    return count;
  }
}
