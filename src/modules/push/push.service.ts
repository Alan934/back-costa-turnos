import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import * as webpush from 'web-push';
import { PushConfig } from '@/config/configuration';
import { uuidv7 } from 'uuidv7';
import { PushSubscription } from './entities/push-subscription.entity';

/** Lo que el service worker muestra. `url` es a dónde lleva el clic. */
export interface PushPayload {
  title: string;
  body: string;
  url: string;
  /** Misma `tag` = la notificación nueva reemplaza a la anterior (no se apilan). */
  tag?: string;
  /** Vibración en ms (Android). */
  vibrate?: number[];
  /** Sin sonido ni vibración, y no queda fija: para reemplazar un aviso anterior con la misma `tag`. */
  silent?: boolean;
  /** Segundos que el servicio de push guarda el aviso si el celular está apagado o sin datos. */
  ttl?: number;
}

/** Un aviso viejo vale poco ("sos el siguiente" de hace media hora): por defecto 10 minutos. */
const DEFAULT_TTL_SECONDS = 60 * 10;

export interface BrowserSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

@Injectable()
export class PushService implements OnModuleInit {
  private readonly logger = new Logger(PushService.name);
  private readonly cfg: PushConfig;

  constructor(
    @InjectRepository(PushSubscription)
    private readonly subs: Repository<PushSubscription>,
    config: ConfigService,
  ) {
    this.cfg = config.getOrThrow<PushConfig>('push');
  }

  onModuleInit(): void {
    if (!this.cfg.enabled) {
      this.logger.warn('Web Push deshabilitado: faltan VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY');
      return;
    }
    webpush.setVapidDetails(this.cfg.subject, this.cfg.publicKey, this.cfg.privateKey);
  }

  get enabled(): boolean {
    return this.cfg.enabled;
  }

  get publicKey(): string {
    return this.cfg.publicKey;
  }

  /** Suscribe un navegador a los avisos de UN turno (cliente anónimo de la sala). */
  async subscribeAppointment(appointmentId: string, sub: BrowserSubscription): Promise<void> {
    await this.upsert({ appointmentId, accountId: null }, sub);
  }

  /** Suscribe un navegador a los avisos de una cuenta (profesional). */
  async subscribeAccount(accountId: string, sub: BrowserSubscription): Promise<void> {
    await this.upsert({ appointmentId: null, accountId }, sub);
  }

  async unsubscribe(endpoint: string): Promise<void> {
    await this.subs.delete({ endpoint });
  }

  hasAppointmentSubscription(appointmentId: string): Promise<boolean> {
    return this.subs.exist({ where: { appointmentId } });
  }

  /** De estos turnos, cuáles tienen al menos un navegador suscripto (1 sola consulta). */
  async subscribedAppointmentIds(appointmentIds: string[]): Promise<Set<string>> {
    if (!this.cfg.enabled || appointmentIds.length === 0) return new Set();
    const rows = await this.subs.find({
      where: { appointmentId: In(appointmentIds) },
      select: { appointmentId: true },
    });
    return new Set(rows.map((r) => r.appointmentId as string));
  }

  sendToAppointment(appointmentId: string, payload: PushPayload): Promise<number> {
    return this.sendTo({ appointmentId }, payload);
  }

  sendToAccount(accountId: string, payload: PushPayload): Promise<number> {
    return this.sendTo({ accountId }, payload);
  }

  /** Borra las suscripciones de un turno (cuando termina, ya no hay a quién avisar). */
  async clearAppointment(appointmentId: string): Promise<void> {
    await this.subs.delete({ appointmentId });
  }

  private async upsert(
    owner: { appointmentId: string | null; accountId: string | null },
    sub: BrowserSubscription,
  ): Promise<void> {
    const existing = await this.subs.findOne({ where: { endpoint: sub.endpoint } });
    if (existing) {
      existing.appointmentId = owner.appointmentId;
      existing.accountId = owner.accountId;
      existing.p256dh = sub.keys.p256dh;
      existing.auth = sub.keys.auth;
      await this.subs.save(existing);
      return;
    }
    await this.subs.save(
      this.subs.create({
        id: uuidv7(),
        ...owner,
        endpoint: sub.endpoint,
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
      }),
    );
  }

  /**
   * Envía a todas las suscripciones del dueño. Nunca lanza: una notificación que
   * falla no debe tumbar la acción del profesional que la disparó. Las
   * suscripciones muertas (404/410: el usuario revocó el permiso o desinstaló) se
   * borran para no reintentar para siempre. Devuelve cuántas se entregaron.
   */
  private async sendTo(
    where: { appointmentId: string } | { accountId: string },
    payload: PushPayload,
  ): Promise<number> {
    if (!this.cfg.enabled) return 0;
    const targets = await this.subs.find({ where });
    // `ttl` es para el servicio de push, no para el service worker: no viaja en el cuerpo.
    const { ttl, ...body } = payload;
    const message = JSON.stringify(body);
    let delivered = 0;
    await Promise.all(
      targets.map(async (t) => {
        try {
          await webpush.sendNotification(
            { endpoint: t.endpoint, keys: { p256dh: t.p256dh, auth: t.auth } },
            message,
            { TTL: ttl ?? DEFAULT_TTL_SECONDS, urgency: 'high' },
          );
          delivered++;
        } catch (err) {
          const status = (err as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) {
            await this.subs.delete({ id: t.id });
          } else {
            this.logger.warn(`Push falló (${status ?? 'sin status'}): ${String(err)}`);
          }
        }
      }),
    );
    return delivered;
  }
}
