import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { Repository } from 'typeorm';
import { NotificationChannel, NotificationType } from '@/common/enums';
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

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification)
    private readonly notifications: Repository<Notification>,
    @InjectQueue(NOTIFICATIONS_QUEUE)
    private readonly queue: Queue<NotificationJobData>,
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

  list(tenantId: string): Promise<Notification[]> {
    return this.notifications.find({
      where: { professionalId: tenantId },
      order: { createdAt: 'DESC' },
      take: 200,
    });
  }
}
