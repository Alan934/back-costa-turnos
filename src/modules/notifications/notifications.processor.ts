import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Job } from 'bullmq';
import { Repository } from 'typeorm';
import { NotificationChannel, NotificationStatus } from '@/common/enums';
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
        payload: notification.payload,
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
