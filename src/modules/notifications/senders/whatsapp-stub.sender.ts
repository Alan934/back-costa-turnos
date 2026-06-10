import { Injectable, Logger } from '@nestjs/common';
import { NotificationChannel } from '@/common/enums';
import { NotificationSender, OutboundNotification } from '../ports/notification-sender.port';

/**
 * Stub de WhatsApp: loguea en lugar de enviar. Reemplazar por la API real.
 */
@Injectable()
export class WhatsappStubSender implements NotificationSender {
  readonly channel = NotificationChannel.Whatsapp;
  private readonly logger = new Logger(WhatsappStubSender.name);

  send(notification: OutboundNotification): Promise<void> {
    this.logger.log(
      `[WHATSAPP stub] to=${notification.to} type=${notification.type} payload=${JSON.stringify(notification.payload)}`,
    );
    return Promise.resolve();
  }
}
