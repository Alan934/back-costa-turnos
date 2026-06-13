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
const BRAND = 'Costa Turnos';

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
    this.frontUrl = app.frontUrl.replace(/\/$/, '');
    this.transporter = mail.host
      ? nodemailer.createTransport({
          host: mail.host,
          port: mail.port,
          secure: mail.port === 465, // 465 = TLS implicito; 587 = STARTTLS
          auth: { user: mail.user, pass: mail.password },
        })
      : null;
  }

  /** Envia el codigo de verificacion segun el proposito (con link al front). */
  async sendVerificationCode(
    email: string,
    purpose: VerificationPurpose,
    code: string,
  ): Promise<void> {
    const { subject, text, html } = this.renderCode(purpose, code, email);

    if (!this.transporter) {
      // Dev/sin SMTP: log para poder continuar el flujo manualmente.
      this.logger.warn(`[MAIL stub] ${purpose} para ${email}: ${code}`);
      return;
    }

    await this.transporter.sendMail({ from: this.from, to: email, subject, text, html });
    this.logger.log(`[EMAIL] codigo ${purpose} enviado a ${email}`);
  }

  /** Envía la invitación de un comercio a un profesional (con link al front). */
  async sendComercioInvitation(email: string, comercioName: string, token: string): Promise<void> {
    const link = `${this.frontUrl}/comercios/invitacion?token=${encodeURIComponent(token)}`;
    const subject = `${comercioName} te invitó a su equipo en ${BRAND}`;
    const text =
      `${comercioName} te invitó a unirte a su equipo en ${BRAND}.\n` +
      `Aceptá la invitación acá:\n${link}\n\n` +
      `(El enlace vence en unos días.)`;
    const html = this.htmlTemplate({
      title: 'Te invitaron a un equipo',
      intro: `${comercioName} te invitó a unirte a su equipo en ${BRAND}. Si aceptás, vas a poder cargar tus servicios, horarios y precios en ese comercio.`,
      cta: 'Aceptar invitación',
      link,
      code: null,
    });

    if (!this.transporter) {
      this.logger.warn(`[MAIL stub] invitacion comercio para ${email}: ${link}`);
      return;
    }
    await this.transporter.sendMail({ from: this.from, to: email, subject, text, html });
    this.logger.log(`[EMAIL] invitacion de comercio enviada a ${email}`);
  }

  private renderCode(
    purpose: VerificationPurpose,
    code: string,
    email: string,
  ): { subject: string; text: string; html: string } {
    // El email se URL-encodea (@ -> %40) para que el link del front sea valido.
    const q = `email=${encodeURIComponent(email)}&code=${code}`;

    switch (purpose) {
      case VerificationPurpose.AccountClaim: {
        const link = `${this.frontUrl}/cuenta/reclamar?${q}`;
        return {
          subject: `Activá tu cuenta en ${BRAND}`,
          text:
            `Te crearon una cuenta en ${BRAND}.\n` +
            `Activá tu cuenta y definí tu contraseña acá:\n${link}\n\n` +
            `(El código ${code} vence en pocos minutos.)`,
          html: this.htmlTemplate({
            title: 'Activá tu cuenta',
            intro: `Te crearon una cuenta en ${BRAND}. Activala y definí tu contraseña:`,
            cta: 'Activar mi cuenta',
            link,
            code,
          }),
        };
      }
      case VerificationPurpose.PasswordReset: {
        const link = `${this.frontUrl}/cuenta/restablecer?${q}`;
        return {
          subject: `Restablecé tu contraseña de ${BRAND}`,
          text:
            `Solicitaste restablecer tu contraseña.\n` +
            `Definí una nueva acá:\n${link}\n\n` +
            `(El código ${code} vence en pocos minutos. Si no fuiste vos, ignorá este mensaje.)`,
          html: this.htmlTemplate({
            title: 'Restablecé tu contraseña',
            intro: 'Solicitaste restablecer tu contraseña. Definí una nueva:',
            cta: 'Cambiar contraseña',
            link,
            code,
          }),
        };
      }
      case VerificationPurpose.EmailVerify:
      default:
        return {
          subject: `Verificá tu email en ${BRAND}`,
          text:
            `Tu código de verificación es: ${code}\n` +
            `Ingresalo en la aplicación para verificar tu email. (Vence en pocos minutos.)`,
          html: this.htmlTemplate({
            title: 'Verificá tu email',
            intro: 'Usá este código para verificar tu email:',
            cta: null,
            link: null,
            code,
          }),
        };
    }
  }

  /** Plantilla HTML simple con botón (si hay link) + código visible (si hay). */
  private htmlTemplate(opts: {
    title: string;
    intro: string;
    cta: string | null;
    link: string | null;
    code: string | null;
  }): string {
    const button =
      opts.link && opts.cta
        ? `<p style="margin:0 0 20px"><a href="${opts.link}" style="display:inline-block;background:#2a2724;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600">${opts.cta}</a></p>`
        : '';
    const codeBlock = opts.code
      ? `<p style="color:#444;margin:0 0 4px">Tu código:</p>` +
        `<p style="font-size:28px;font-weight:700;letter-spacing:4px;margin:0 0 8px;color:#111">${opts.code}</p>` +
        `<p style="font-size:13px;color:#888;margin:0">El código vence en pocos minutos.</p>`
      : '';
    const fallback = opts.link
      ? `<p style="font-size:12px;color:#888;word-break:break-all;margin:8px 0 0">O copiá este enlace:<br><a href="${opts.link}" style="color:#888">${opts.link}</a></p>`
      : '';
    return (
      `<!doctype html><html lang="es"><body style="font-family:system-ui,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#f5f5f5;margin:0;padding:24px">` +
      `<div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px">` +
      `<h1 style="font-size:20px;margin:0 0 12px;color:#111">${opts.title}</h1>` +
      `<p style="color:#444;margin:0 0 20px">${opts.intro}</p>` +
      button +
      codeBlock +
      fallback +
      `<hr style="border:none;border-top:1px solid #eee;margin:24px 0">` +
      `<p style="font-size:12px;color:#aaa;margin:0">${BRAND}</p>` +
      `</div></body></html>`
    );
  }
}
