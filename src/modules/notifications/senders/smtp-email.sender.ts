import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { Transporter } from 'nodemailer';
import { NotificationChannel, NotificationType } from '@/common/enums';
import { MailConfig } from '@/config/configuration';
import { NotificationSender, OutboundNotification } from '../ports/notification-sender.port';

/**
 * Sender de email real via SMTP (nodemailer). Se usa cuando MAIL_HOST esta
 * configurado; si no, el modulo cae al stub. El asunto/cuerpo se derivan del
 * tipo de notificacion + payload.
 */
@Injectable()
export class SmtpEmailSender implements NotificationSender {
  readonly channel = NotificationChannel.Email;
  private readonly logger = new Logger(SmtpEmailSender.name);
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(config: ConfigService) {
    const mail = config.getOrThrow<MailConfig>('mail');
    this.from = mail.from;
    this.transporter = nodemailer.createTransport({
      host: mail.host,
      port: mail.port,
      secure: mail.port === 465, // 465 = TLS implicito; 587 = STARTTLS
      auth: { user: mail.user, pass: mail.password },
    });
  }

  async send(notification: OutboundNotification): Promise<void> {
    if (!notification.to) {
      this.logger.warn(`Notificacion ${notification.type} sin destinatario; se omite.`);
      return;
    }
    const { subject, text } = this.render(notification);
    await this.transporter.sendMail({ from: this.from, to: notification.to, subject, text });
    this.logger.log(`[EMAIL] enviado a ${notification.to} (${notification.type})`);
  }

  /** Mapea tipo + payload a un asunto y cuerpo en texto plano. */
  private render(n: OutboundNotification): { subject: string; text: string } {
    const p = n.payload ?? {};
    switch (n.type) {
      case NotificationType.Reminder:
        return {
          subject: 'Recordatorio de tu turno',
          text: `Te recordamos tu turno${p.startAt ? ` para el ${String(p.startAt)}` : ''}.`,
        };
      case NotificationType.Waitlist:
        return {
          subject: 'Se liberó un turno',
          text: 'Se liberó un horario que estabas esperando. Ingresá para reservarlo.',
        };
      case NotificationType.Bumped:
        return {
          subject: 'Tu turno fue reprogramado',
          text: 'Tu turno provisorio fue desplazado. Te pedimos que vuelvas a confirmar.',
        };
      case NotificationType.Deposit:
        return {
          subject: 'Seña pendiente para confirmar tu turno',
          text: 'Para confirmar tu turno necesitás abonar la seña. Ingresá para completar el pago.',
        };
      case NotificationType.Subscription:
        return {
          subject: 'Estado de tu suscripción',
          text: 'Hay novedades sobre el estado de tu suscripción. Ingresá para revisarlas.',
        };
      default:
        return {
          subject: 'Notificación de Turnerito',
          text: `Tenés una nueva notificación (${n.type}).`,
        };
    }
  }
}
