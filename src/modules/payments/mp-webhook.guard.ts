import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { AppConfig, MercadoPagoConfig } from '@/config/configuration';

/**
 * Valida la firma de los webhooks de MercadoPago (header `x-signature`).
 *
 * MP firma `id:<data.id>;request-id:<x-request-id>;ts:<ts>;` con HMAC-SHA256 usando la
 * "clave secreta" de la app (MP_WEBHOOK_SECRET). Así solo MP puede disparar el procesamiento:
 * cualquiera podía hacer POST al endpoint público y forzar consultas a la API de MP (o, con el
 * proveedor stub, marcar pagos como acreditados).
 *
 *  - Con secreto configurado: la firma es obligatoria siempre.
 *  - Sin secreto: en producción se RECHAZA todo (mejor perder la notificación que aceptar
 *    pagos sin verificar); en desarrollo se deja pasar para poder probar con el stub.
 */
@Injectable()
export class MpWebhookGuard implements CanActivate {
  private readonly logger = new Logger(MpWebhookGuard.name);
  private readonly secret: string;
  private readonly isProduction: boolean;

  constructor(config: ConfigService) {
    this.secret = config.getOrThrow<MercadoPagoConfig>('mercadopago').webhookSecret;
    this.isProduction = config.getOrThrow<AppConfig>('app').env === 'production';
  }

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();

    if (!this.secret) {
      if (this.isProduction) {
        this.logger.error('MP_WEBHOOK_SECRET no está configurado: se rechaza el webhook de MP.');
        throw new UnauthorizedException('Webhook no habilitado');
      }
      return true;
    }

    const signature = req.header('x-signature') ?? '';
    const requestId = req.header('x-request-id') ?? '';
    const body = (req.body ?? {}) as { data?: { id?: string | number } };
    // MP manda el id del recurso como query `data.id` (y también en el body).
    const rawId = (req.query?.['data.id'] ?? body.data?.id) as string | number | undefined;

    if (!this.isValid(signature, requestId, rawId == null ? '' : String(rawId))) {
      this.logger.warn('Webhook de MP con firma inválida: rechazado.');
      throw new UnauthorizedException('Firma inválida');
    }
    return true;
  }

  private isValid(signature: string, requestId: string, dataId: string): boolean {
    const parts = Object.fromEntries(
      signature.split(',').map((p) => {
        const i = p.indexOf('=');
        return [p.slice(0, i).trim(), p.slice(i + 1).trim()];
      }),
    ) as Record<string, string>;
    const ts = parts['ts'];
    const v1 = parts['v1'];
    if (!ts || !v1) return false;

    // MP usa el id en minúsculas cuando es alfanumérico.
    const id = /^[a-z0-9]+$/i.test(dataId) ? dataId.toLowerCase() : dataId;
    let manifest = '';
    if (id) manifest += `id:${id};`;
    if (requestId) manifest += `request-id:${requestId};`;
    manifest += `ts:${ts};`;

    const expected = createHmac('sha256', this.secret).update(manifest).digest('hex');
    const a = Buffer.from(expected);
    const b = Buffer.from(v1);
    return a.length === b.length && timingSafeEqual(a, b);
  }
}
