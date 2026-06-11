import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { Transporter } from 'nodemailer';
import { VerificationPurpose } from '@/common/enums';
import { AppConfig, MailConfig } from '@/config/configuration';

/**
 * Envio de emails transaccionales directos (no pasa por la cola de notificaciones,
 * que es para avisos no urgentes vinculados a una persona/tenant). Se usa para
 * codigos de verificacion: reclamo de cuenta, verificacion de email y reseteo.
 *
 * Si MAIL_HOST no esta configurado (dev local), loguea el codigo en vez de enviar.
 */
@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);
  private readonly transporter: Transporter | null;
  private readonly from: string;
  private readonly frontUrl: string;

  constructor(config: ConfigService) {
    const mail = config.getOrThrow<MailConfig>('mail');
    const app = config.getOrThrow<AppConfig>('app');
    this.from = mail.from;
    this.frontUrl = app.frontUrl;
    this.transporter = mail.host
      ? nodemailer.createTransport({
          host: mail.host,
          port: mail.port,
          secure: mail.port === 465, // 465 = TLS implicito; 587 = STARTTLS
          auth: { user: mail.user, pass: mail.password },
        })
      : null;
  }

  /** Envia el codigo de verificacion segun el proposito. */
  async sendVerificationCode(
    email: string,
    purpose: VerificationPurpose,
    code: string,
  ): Promise<void> {
    const { subject, text } = this.renderCode(purpose, code);

    if (!this.transporter) {
      // Dev/sin SMTP: log para poder continuar el flujo manualmente.
      this.logger.warn(`[MAIL stub] ${purpose} para ${email}: ${code}`);
      return;
    }

    await this.transporter.sendMail({ from: this.from, to: email, subject, text });
    this.logger.log(`[EMAIL] codigo ${purpose} enviado a ${email}`);
  }

  private renderCode(
    purpose: VerificationPurpose,
    code: string,
  ): { subject: string; text: string } {
    switch (purpose) {
      case VerificationPurpose.AccountClaim:
        return {
          subject: 'Activá tu cuenta en Turnerito',
          text:
            `Te crearon una cuenta en Turnerito.\n\n` +
            `Tu código para activarla es: ${code}\n\n` +
            `Ingresá a ${this.frontUrl} y usá este código para definir tu contraseña. ` +
            `El código vence en pocos minutos.`,
        };
      case VerificationPurpose.PasswordReset:
        return {
          subject: 'Restablecé tu contraseña de Turnerito',
          text:
            `Solicitaste restablecer tu contraseña.\n\n` +
            `Tu código es: ${code}\n\n` +
            `Si no fuiste vos, ignorá este mensaje. El código vence en pocos minutos.`,
        };
      case VerificationPurpose.EmailVerify:
      default:
        return {
          subject: 'Verificá tu email en Turnerito',
          text:
            `Tu código de verificación es: ${code}\n\n` +
            `Ingresalo en la aplicación para verificar tu email. ` +
            `El código vence en pocos minutos.`,
        };
    }
  }
}
