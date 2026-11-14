import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { Repository } from 'typeorm';
import { NotificationChannel, NotificationType } from '@/common/enums';
import { Professional } from '@/modules/professionals/entities/professional.entity';
import { PushService } from '@/modules/push/push.service';
import { Notification } from './entities/notification.entity';
import { NOTIFICATIONS_QUEUE, NotificationJobData } from './notifications.constants';

export interface EnqueueNotificationInput {
  professionalId?: string | null;
  personId?: string | null;
  channel: NotificationChannel;
  type: NotificationType;
  payload?: Record<string, unknown>;
  /** cuando enviarla; default ahora. */
  scheduledFor?: Date;
}

export interface AppointmentNoticeInput {
  professionalId: string;
  personId: string;
  appointmentId: string;
  startAt: Date;
  endAt: Date;
  /** Zona horaria del profesional: la fecha del mail se escribe en su hora local. */
  timezone: string;
  serviceName: string;
  professionalName?: string | null;
  placeName: string;
  address?: string | null;
  isProvisional?: boolean;
  /** Frase sobre el pago ("Ya abonaste $ 2.000.", "Abonás en el local."). */
  paymentNote?: string | null;
  /** Token del link "gestionar mi turno" (/turno/:token), si el turno lo tiene. */
  manageToken?: string | null;
  /** false = solo reprograma el recordatorio (p. ej. al mover el turno). */
  confirmation?: boolean;
}

/** El recordatorio sale 24 h antes del turno. */
const REMINDER_LEAD_MS = 24 * 3_600_000;
/** ...salvo que para ese momento falten menos de 2 h (reservó sobre la hora). */
const REMINDER_MIN_GAP_MS = 2 * 3_600_000;

/** "martes 17 de noviembre a las 10:30" en la zona horaria dada. */
export function formatWhen(date: Date, timezone: string): string {
  const fmt = (timeZone: string) => {
    const day = new Intl.DateTimeFormat('es-AR', {
      timeZone,
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }).format(date);
    const time = new Intl.DateTimeFormat('es-AR', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(date);
    return `${day} a las ${time}`;
  };
  try {
    return fmt(timezone);
  } catch {
    return fmt('America/Argentina/Buenos_Aires'); // zona inválida guardada en el perfil
  }
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectRepository(Notification)
    private readonly notifications: Repository<Notification>,
    @InjectQueue(NOTIFICATIONS_QUEUE)
    private readonly queue: Queue<NotificationJobData>,
    @InjectRepository(Professional)
    private readonly professionals: Repository<Professional>,
    private readonly push: PushService,
  ) {}

  /**
   * Persiste la notificacion (cola durable) y la encola en BullMQ con el delay
   * correspondiente. Los reintentos los maneja BullMQ (backoff).
   */
  async enqueue(input: EnqueueNotificationInput): Promise<Notification> {
    const scheduledFor = input.scheduledFor ?? new Date();
    const notification = await this.notifications.save(
      this.notifications.create({
        professionalId: input.professionalId ?? null,
        personId: input.personId ?? null,
        channel: input.channel,
        type: input.type,
        payload: input.payload ?? {},
        scheduledFor,
      }),
    );

    const delay = Math.max(0, scheduledFor.getTime() - Date.now());
    await this.queue.add(
      'send',
      { notificationId: notification.id },
      {
        delay,
        attempts: 5,
        backoff: { type: 'exponential', delay: 30_000 },
        removeOnComplete: 1000,
        removeOnFail: 5000,
      },
    );

    return notification;
  }

  /**
   * Avisos al CLIENTE por un turno: la confirmación (ahora) y el recordatorio (24 h antes).
   * Se guarda en el payload una "foto" de los datos a mostrar para que el envío no dependa
   * de volver a consultar el turno. El recordatorio se descarta al enviarse si el turno fue
   * cancelado o movido (ver NotificationsProcessor).
   *
   * Nunca lanza: un problema con la cola de avisos no debe hacer fallar una reserva.
   */
  async notifyAppointment(input: AppointmentNoticeInput): Promise<void> {
    try {
      // Sin recordatorio si faltan menos de ~26 h: acaba de reservar (o de moverlo).
      const remindAt = new Date(input.startAt.getTime() - REMINDER_LEAD_MS);
      const willRemind = remindAt.getTime() - Date.now() >= REMINDER_MIN_GAP_MS;
      const payload = {
        willRemind,
        appointmentId: input.appointmentId,
        startAt: input.startAt.toISOString(),
        endAt: input.endAt.toISOString(),
        whenText: formatWhen(input.startAt, input.timezone),
        serviceName: input.serviceName,
        professionalName: input.professionalName ?? null,
        placeName: input.placeName,
        address: input.address ?? null,
        isProvisional: input.isProvisional ?? false,
        paymentNote: input.paymentNote ?? null,
        manageToken: input.manageToken ?? null,
      };
      const base = {
        professionalId: input.professionalId,
        personId: input.personId,
        channel: NotificationChannel.Email,
      };
      if (input.confirmation !== false) {
        await this.enqueue({ ...base, type: NotificationType.Booked, payload });
      }
      if (willRemind) {
        await this.enqueue({
          ...base,
          type: NotificationType.Reminder,
          payload,
          scheduledFor: remindAt,
        });
      }
    } catch (err) {
      this.logger.warn(`No se pudieron encolar los avisos del turno: ${String(err)}`);
    }
  }

  /**
   * Aviso al PROFESIONAL de algo que hizo un cliente (reservó, canceló, reprogramó): email a
   * su cuenta y notificación en los dispositivos donde activó los avisos. Respeta sus
   * preferencias (`notificationPrefs`: un canal sale salvo que esté en false).
   *
   * Nunca lanza: un aviso fallido no debe romper la acción del cliente que lo disparó.
   */
  async notifyProfessional(input: {
    professionalId: string;
    type: NotificationType;
    payload: Record<string, unknown>;
    push: { title: string; body: string; url: string; tag?: string };
  }): Promise<void> {
    try {
      const professional = await this.professionals.findOne({
        where: { id: input.professionalId },
        select: { id: true, accountId: true, notificationPrefs: true },
      });
      if (!professional) return;
      const prefs = professional.notificationPrefs ?? {};

      if (prefs.email !== false) {
        await this.enqueue({
          professionalId: professional.id,
          channel: NotificationChannel.Email,
          type: input.type,
          payload: input.payload,
        });
      }
      if (prefs.push !== false) {
        await this.push.sendToAccount(professional.accountId, input.push);
      }
    } catch (err) {
      this.logger.warn(`No se pudo avisar al profesional (${input.type}): ${String(err)}`);
    }
  }

  list(tenantId: string): Promise<Notification[]> {
    return this.notifications.find({
      where: { professionalId: tenantId },
      order: { createdAt: 'DESC' },
      take: 200,
    });
  }
}
