import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MercadoPagoConfig, Payment, Preference } from 'mercadopago';
import { AppConfig, MercadoPagoConfig as MpConfig } from '@/config/configuration';
import {
  CreatePreferenceInput,
  CreatePreferenceResult,
  PaymentProvider,
  WebhookResult,
} from '../ports/payment-provider.port';

/**
 * Implementacion real de MercadoPago (SDK v3).
 * - Señas/turnos: se crean con el access token del PROFESIONAL (marketplace),
 *   opcionalmente con marketplace_fee para la plataforma.
 * - Suscripciones: se crean con el access token de la PLATAFORMA.
 * El webhook consulta el pago con el token de la plataforma.
 */
@Injectable()
export class MercadoPagoProvider implements PaymentProvider {
  private readonly logger = new Logger(MercadoPagoProvider.name);
  private readonly mp: MpConfig;
  private readonly notificationUrl: string;

  constructor(private readonly config: ConfigService) {
    this.mp = config.getOrThrow<MpConfig>('mercadopago');
    const app = config.getOrThrow<AppConfig>('app');
    this.notificationUrl = `${app.appUrl.replace(/\/$/, '')}/v1/payments/mp/webhook`;
  }

  isConfigured(): boolean {
    return Boolean(this.mp.accessToken);
  }

  private client(accessToken: string): MercadoPagoConfig {
    return new MercadoPagoConfig({ accessToken });
  }

  async createPreference(input: CreatePreferenceInput): Promise<CreatePreferenceResult> {
    const token = input.sellerAccessToken || this.mp.accessToken;
    if (!token) {
      throw new Error('MercadoPago sin access token configurado');
    }
    const preference = new Preference(this.client(token));
    const notificationUrl = input.notificationUrl || this.notificationUrl;
    // MP exige notification_url y back_urls publicos (no localhost). En local los
    // omitimos para poder generar la preferencia igual.
    const isPublic = (url?: string | null): boolean =>
      !!url && /^https:\/\//.test(url) && !/localhost|127\.0\.0\.1/.test(url);

    try {
      const res = await preference.create({
        body: {
          items: [
            {
              id: input.externalReference,
              title: input.description,
              quantity: 1,
              unit_price: input.amountCents / 100,
              currency_id: 'ARS',
            },
          ],
          external_reference: input.externalReference,
          ...(isPublic(notificationUrl) ? { notification_url: notificationUrl } : {}),
          ...(input.payerEmail ? { payer: { email: input.payerEmail } } : {}),
          // marketplace_fee debe incluirse siempre (incluso 0) cuando se usa el token del vendedor,
          // para que MP reconozca el flujo marketplace y enrute el pago correctamente.
          ...(input.sellerAccessToken != null
            ? { marketplace_fee: (input.marketplaceFeeCents ?? 0) / 100 }
            : {}),
          ...(isPublic(input.backUrl)
            ? {
                back_urls: {
                  success: input.backUrl as string,
                  failure: input.backUrl as string,
                  pending: input.backUrl as string,
                },
                auto_return: 'approved',
              }
            : {}),
        },
      });
      const initPoint = res.init_point ?? res.sandbox_init_point;
      if (!res.id || !initPoint) {
        throw new Error('MercadoPago no devolvio id/init_point de la preferencia');
      }
      return { externalRef: res.id, initPoint };
    } catch (err) {
      const detail =
        err && typeof err === 'object' && 'cause' in err
          ? JSON.stringify((err as { cause: unknown }).cause)
          : String(err);
      this.logger.error(`MercadoPago createPreference fallo: ${detail}`);
      throw err;
    }
  }

  async parseWebhook(payload: Record<string, unknown>): Promise<WebhookResult | null> {
    const type = (payload['type'] ?? payload['topic']) as string | undefined;
    if (type && type !== 'payment') {
      // Solo nos interesan notificaciones de pago.
      return null;
    }
    const data = payload['data'] as { id?: string | number } | undefined;
    const rawId = data?.id ?? payload['id'] ?? (payload['resource'] as string | undefined);
    const paymentId = rawId != null ? String(rawId) : null;
    if (!paymentId) return null;

    try {
      const payment = new Payment(this.client(this.mp.accessToken));
      const p = await payment.get({ id: paymentId });
      const status = p.status ?? 'unknown';
      return {
        externalReference: p.external_reference ?? null,
        paid: status === 'approved',
        status,
        providerPaymentId: String(p.id ?? paymentId),
      };
    } catch (err) {
      this.logger.warn(`No se pudo consultar el pago MP ${paymentId}: ${String(err)}`);
      return null;
    }
  }
}
