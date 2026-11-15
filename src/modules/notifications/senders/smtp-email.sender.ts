import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { Transporter } from 'nodemailer';
import { NotificationChannel, NotificationType } from '@/common/enums';
import { AppConfig, MailConfig } from '@/config/configuration';
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
  private readonly frontUrl: string;

  constructor(config: ConfigService) {
    const mail = config.getOrThrow<MailConfig>('mail');
    this.from = mail.from;
    this.frontUrl = config.getOrThrow<AppConfig>('app').frontUrl.replace(/\/$/, '');
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

  /** Datos del turno (servicio, cuándo, con quién, dónde, pago), una línea por dato. */
  private appointmentLines(p: Record<string, unknown>): string {
    const where = [str(p.placeName), str(p.address)].filter(Boolean).join(' · ');
    return [
      str(p.serviceName) && `Servicio: ${str(p.serviceName)}`,
      str(p.whenText) && `Cuándo: ${str(p.whenText)}`,
      str(p.professionalName) && `Con: ${str(p.professionalName)}`,
      where && `Dónde: ${where}`,
      str(p.paymentNote),
    ]
      .filter(Boolean)
      .join('\n');
  }

  /** Enlaces para gestionar el turno y agendarlo. */
  private manageLines(p: Record<string, unknown>): string {
    const token = str(p.manageToken);
    const lines = token
      ? [
          '',
          // Link personal: abre el turno directo, sin cuenta ni contraseña.
          `¿No podés ir? Reprogramalo o cancelalo acá: ${this.frontUrl}/turno/${token}`,
        ]
      : [
          '',
          `¿No podés ir? Reprogramalo o cancelalo desde "Mis turnos": ${this.frontUrl}/mis-turnos`,
          '(Ingresá con este mismo email; si no tenés cuenta, creala y el turno aparece solo.)',
        ];
    const calendar = googleCalendarUrl(p);
    if (calendar) lines.push('', `Agregar a Google Calendar: ${calendar}`);
    return lines.join('\n');
  }

  /** Mapea tipo + payload a un asunto y cuerpo en texto plano. */
  private render(n: OutboundNotification): { subject: string; text: string } {
    const p = n.payload ?? {};
    switch (n.type) {
      case NotificationType.Booked: {
        const provisional = p.isProvisional === true;
        const previous = str(p.previousWhenText);
        if (previous) {
          return {
            subject: `Cambió el horario de tu turno: ${str(p.whenText) || 'nuevo horario'}`,
            text: [
              `${str(p.placeName) || 'El negocio'} cambió el horario de tu turno.`,
              `Antes: ${previous}`,
              `Ahora: ${str(p.whenText)}`,
              '',
              this.appointmentLines(p),
              ...(p.willRemind === true ? ['', 'Te lo vamos a recordar el día anterior.'] : []),
              this.manageLines(p),
            ].join('\n'),
          };
        }
        const seriesDates = Array.isArray(p.seriesDates)
          ? p.seriesDates.map(str).filter(Boolean)
          : [];
        if (seriesDates.length > 1) {
          return {
            subject: `Tus turnos fijos en ${str(p.placeName) || 'el negocio'}`,
            text: [
              `Te reservamos ${seriesDates.length} turnos:`,
              '',
              ...seriesDates.map((d) => `• ${d}`),
              '',
              this.appointmentLines({ ...p, whenText: '' }),
              '',
              'Te vamos a recordar cada uno el día anterior.',
              this.manageLines({ ...p, startAt: '', endAt: '' }),
              '(Ese link es del primer turno; cada recordatorio trae el suyo.)',
            ].join('\n'),
          };
        }
        return {
          subject: provisional
            ? `Turno provisional en ${str(p.placeName) || 'tu negocio'}`
            : `Turno confirmado: ${str(p.whenText) || 'tu reserva'}`,
          text: [
            provisional
              ? 'Reservaste un turno PROVISIONAL: sin seña, otra persona que abone puede quedarse con el horario.'
              : '¡Tu turno quedó confirmado!',
            '',
            this.appointmentLines(p),
            ...(p.willRemind === true ? ['', 'Te lo vamos a recordar el día anterior.'] : []),
            this.manageLines(p),
          ].join('\n'),
        };
      }
      case NotificationType.Reminder: {
        const token = str(p.manageToken);
        // El negocio pide confirmación: un toque para "voy" y otro para liberar el horario.
        if (p.askConfirmation === true && token) {
          const link = `${this.frontUrl}/turno/${token}`;
          return {
            subject: `¿Venís? Confirmá tu turno ${str(p.whenText) ? `del ${str(p.whenText)}` : 'de mañana'}`,
            text: [
              'Te recordamos tu turno:',
              '',
              this.appointmentLines(p),
              '',
              `¿Venís? Confirmalo con un toque: ${link}?r=si`,
              `¿No podés venir? Avisanos acá y liberamos el horario para otra persona: ${link}?r=no`,
              '',
              `También podés reprogramarlo: ${link}`,
            ].join('\n'),
          };
        }
        return {
          subject: `Recordatorio: tu turno es ${str(p.whenText) ? `el ${str(p.whenText)}` : 'mañana'}`,
          text: [
            'Te recordamos tu turno:',
            '',
            this.appointmentLines(p),
            this.manageLines(p),
          ].join('\n'),
        };
      }
      case NotificationType.Waitlist:
        return {
          subject: str(p.whenText) ? `Se liberó un turno: ${str(p.whenText)}` : 'Se liberó un turno',
          text: [
            'Se liberó un horario que estabas esperando:',
            '',
            [
              str(p.serviceName) && `Servicio: ${str(p.serviceName)}`,
              str(p.whenText) && `Cuándo: ${str(p.whenText)}`,
              str(p.placeName) && `Dónde: ${str(p.placeName)}`,
            ]
              .filter(Boolean)
              .join('\n'),
            '',
            str(p.bookPath)
              ? `Reservalo acá antes de que lo tome otra persona: ${this.frontUrl}${str(p.bookPath)}`
              : 'Ingresá a la página del negocio para reservarlo.',
            '(No queda reservado a tu nombre: se lo lleva quien lo reserve primero.)',
          ].join('\n'),
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
      case NotificationType.ProBooked:
      case NotificationType.ProCancelled: {
        const booked = n.type === NotificationType.ProBooked;
        const who = str(p.clientName) || 'Un cliente';
        const contact = [str(p.clientPhone), str(p.clientEmail)].filter(Boolean).join(' · ');
        return {
          subject: booked
            ? `Nuevo turno: ${who}${str(p.whenText) ? `, ${str(p.whenText)}` : ''}`
            : `Turno cancelado: ${who}${str(p.whenText) ? `, ${str(p.whenText)}` : ''}`,
          text: [
            booked ? `${who} reservó un turno.` : `${who} canceló su turno. El horario quedó libre.`,
            '',
            [
              str(p.serviceName) && `Servicio: ${str(p.serviceName)}`,
              str(p.whenText) && `Cuándo: ${str(p.whenText)}`,
              str(p.professionalName) && `Con: ${str(p.professionalName)}`,
              contact && `Contacto: ${contact}`,
              booked && p.isProvisional === true && 'Turno provisional (sin seña).',
              booked && str(p.paymentNote),
            ]
              .filter(Boolean)
              .join('\n'),
            '',
            `Ver la agenda: ${this.frontUrl}/app/agenda`,
            `(Podés apagar estos avisos en Configuración: ${this.frontUrl}/app/configuracion)`,
          ].join('\n'),
        };
      }
      case NotificationType.DailySummary: {
        const items = Array.isArray(p.items) ? (p.items as Record<string, unknown>[]) : [];
        const count = items.length;
        const lines = items.map((it) =>
          [
            str(it.time),
            str(it.serviceName),
            [str(it.clientName), str(it.clientPhone) && `(${str(it.clientPhone)})`]
              .filter(Boolean)
              .join(' '),
            str(it.staffName) && `con ${str(it.staffName)}`,
            it.isProvisional === true && 'provisional, sin seña',
          ]
            .filter(Boolean)
            .join(' · '),
        );
        const first = items[0];
        return {
          subject:
            count === 1
              ? `Hoy tenés 1 turno, a las ${str(first?.time)}`
              : `Hoy tenés ${count} turnos (el primero a las ${str(first?.time)})`,
          text: [
            `¡Buen día! Estos son tus turnos de hoy${str(p.dayText) ? `, ${str(p.dayText)}` : ''}:`,
            '',
            ...lines,
            '',
            `Ver la agenda: ${this.frontUrl}/app/agenda`,
            `(Podés apagar este resumen en Configuración: ${this.frontUrl}/app/configuracion)`,
          ].join('\n'),
        };
      }
      case NotificationType.Rescheduled: {
        const who = str(p.clientName) || 'Un cliente';
        const oldAt = str(p.oldStartAt);
        const newAt = str(p.newStartAt);
        const fromTo = oldAt && newAt ? ` Cambió del ${oldAt} al ${newAt}.` : '';
        return {
          subject: 'Un cliente reprogramó su turno',
          text: `${who} reprogramó su turno.${fromTo} Ingresá para ver tu agenda.`,
        };
      }
      default:
        return {
          subject: 'Notificación de Turnerito',
          text: `Tenés una nueva notificación (${n.type}).`,
        };
    }
  }
}

/** Link "crear evento" de Google Calendar a partir del payload del turno ('' si faltan fechas). */
function googleCalendarUrl(p: Record<string, unknown>): string {
  const stamp = (v: unknown): string => {
    const d = new Date(str(v));
    return Number.isNaN(d.getTime()) ? '' : d.toISOString().replace(/[-:]|\.\d{3}/g, '');
  };
  const start = stamp(p.startAt);
  const end = stamp(p.endAt);
  if (!start || !end) return '';
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: [str(p.serviceName), str(p.placeName)].filter(Boolean).join(' en ') || 'Turno',
    dates: `${start}/${end}`,
  });
  const location = [str(p.placeName), str(p.address)].filter(Boolean).join(', ');
  if (location) params.set('location', location);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** Normaliza un valor de payload (unknown) a string; vacío si no es primitivo. */
function str(v: unknown): string {
  return typeof v === 'string' || typeof v === 'number' ? String(v) : '';
}
