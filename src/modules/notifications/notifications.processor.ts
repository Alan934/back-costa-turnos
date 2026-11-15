import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Job } from 'bullmq';
import { Repository } from 'typeorm';
import {
  AppointmentStatus,
  NotificationChannel,
  NotificationStatus,
  NotificationType,
} from '@/common/enums';
import { Appointment } from '@/modules/appointments/entities/appointment.entity';
import { Person } from '@/modules/identity/entities/person.entity';
import { Account } from '@/modules/identity/entities/account.entity';
import { Professional } from '@/modules/professionals/entities/professional.entity';
import { Notification } from './entities/notification.entity';
import { NOTIFICATIONS_QUEUE, NotificationJobData } from './notifications.constants';
import { NOTIFICATION_SENDERS, NotificationSender } from './ports/notification-sender.port';

/**
 * Worker BullMQ que envia notificaciones encoladas y actualiza su estado.
 */
@Processor(NOTIFICATIONS_QUEUE)
export class NotificationsProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationsProcessor.name);
  private readonly byChannel: Map<NotificationChannel, NotificationSender>;

  constructor(
    @InjectRepository(Notification)
    private readonly notifications: Repository<Notification>,
    @InjectRepository(Person)
    private readonly persons: Repository<Person>,
    @InjectRepository(Professional)
    private readonly professionals: Repository<Professional>,
    @InjectRepository(Account)
    private readonly accounts: Repository<Account>,
    @InjectRepository(Appointment)
    private readonly appointments: Repository<Appointment>,
    @Inject(NOTIFICATION_SENDERS)
    senders: NotificationSender[],
  ) {
    super();
    this.byChannel = new Map(senders.map((s) => [s.channel, s]));
  }

  async process(job: Job<NotificationJobData>): Promise<void> {
    const notification = await this.notifications.findOne({
      where: { id: job.data.notificationId },
    });
    if (!notification) {
      this.logger.warn(`Notificacion ${job.data.notificationId} no encontrada`);
      return;
    }
    if (notification.status === NotificationStatus.Sent) return;

    // Un recordatorio se programa con días de anticipación: para cuando sale, el turno pudo
    // haberse cancelado o movido (al moverlo se programa otro). En ese caso se descarta.
    if (notification.type === NotificationType.Reminder && (await this.isStaleReminder(notification))) {
      await this.notifications.delete({ id: notification.id });
      return;
    }

    const sender = this.byChannel.get(notification.channel);
    if (!sender) {
      throw new Error(`Sin sender para el canal ${notification.channel}`);
    }

    notification.attempts += 1;
    try {
      const to = await this.resolveDestination(notification);
      await sender.send({
        to,
        channel: notification.channel,
        type: notification.type,
        payload: await this.withConfirmationRequest(notification),
      });
      notification.status = NotificationStatus.Sent;
      notification.sentAt = new Date();
      await this.notifications.save(notification);
    } catch (err) {
      notification.status = NotificationStatus.Failed;
      await this.notifications.save(notification);
      throw err; // deja que BullMQ reintente
    }
  }

  /**
   * Recordatorio de un negocio que pide confirmación: se agrega `askConfirmation` al payload
   * (el email suma "Confirmo / No puedo ir"). Se decide al salir, no al reservar: si el
   * profesional lo prende o apaga, aplica también a los recordatorios ya programados.
   */
  private async withConfirmationRequest(
    notification: Notification,
  ): Promise<Record<string, unknown>> {
    const payload = notification.payload ?? {};
    if (notification.type !== NotificationType.Reminder || !notification.professionalId) {
      return payload;
    }
    const professional = await this.professionals.findOne({
      where: { id: notification.professionalId },
      select: { id: true, askConfirmation: true },
    });
    return professional?.askConfirmation ? { ...payload, askConfirmation: true } : payload;
  }

  /** true si el turno del recordatorio ya no existe, no sigue en pie o cambió de horario. */
  private async isStaleReminder(notification: Notification): Promise<boolean> {
    const { appointmentId, startAt } = notification.payload as {
      appointmentId?: unknown;
      startAt?: unknown;
    };
    if (typeof appointmentId !== 'string') return false; // recordatorio sin turno asociado
    const appointment = await this.appointments.findOne({ where: { id: appointmentId } });
    if (!appointment) return true;
    const active =
      appointment.status === AppointmentStatus.Confirmed ||
      appointment.status === AppointmentStatus.Requested;
    const moved = typeof startAt === 'string' && appointment.startAt.toISOString() !== startAt;
    return !active || moved;
  }

  private async resolveDestination(notification: Notification): Promise<string | null> {
    if (notification.personId) {
      const person = await this.persons.findOne({ where: { id: notification.personId } });
      if (!person) return null;
      return notification.channel === NotificationChannel.Email ? person.email : person.phone;
    }
    // Notificación dirigida al profesional: su contacto vive en la cuenta (solo email).
    if (notification.professionalId && notification.channel === NotificationChannel.Email) {
      const professional = await this.professionals.findOne({
        where: { id: notification.professionalId },
      });
      if (!professional) return null;
      const account = await this.accounts.findOne({ where: { id: professional.accountId } });
      return account?.email ?? null;
    }
    return null;
  }
}
