import { Injectable, Logger } from '@nestjs/common';
import { NotificationChannel } from '@/common/enums';
import { NotificationSender, OutboundNotification } from '../ports/notification-sender.port';

/**
 * Stub de email: loguea en lugar de enviar. Reemplazar por SMTP/Resend/SES.
 */
@Injectable()
export class EmailStubSender implements NotificationSender {
  readonly channel = NotificationChannel.Email;
  private readonly logger = new Logger(EmailStubSender.name);

  send(notification: OutboundNotification): Promise<void> {
    this.logger.log(
      `[EMAIL stub] to=${notification.to} type=${notification.type} payload=${JSON.stringify(notification.payload)}`,
    );
    return Promise.resolve();
  }
}
