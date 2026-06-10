export interface CreatePreferenceInput {
  /** Referencia propia para reconciliar el webhook (p. ej. "pay:<id>" o "sub:<id>"). */
  externalReference: string;
  description: string;
  amountCents: number;
  payerEmail?: string | null;
  /**
   * Access token del vendedor (profesional) para que el pago entre a SU cuenta
   * (marketplace). Si no se pasa, cobra la plataforma (p. ej. suscripciones).
   */
  sellerAccessToken?: string | null;
  /** Comision de la plataforma (centavos) cuando cobra el vendedor. */
  marketplaceFeeCents?: number;
  /** URL de retorno tras el pago (front). */
  backUrl?: string | null;
  /** Override del notification_url (webhook) para esta preferencia. */
  notificationUrl?: string | null;
}

export interface CreatePreferenceResult {
  /** id de la preferencia en el proveedor. */
  externalRef: string;
  /** URL a la que redirigir al pagador. */
  initPoint: string;
}

export interface WebhookResult {
  /** external_reference que pusimos al crear la preferencia. */
  externalReference: string | null;
  paid: boolean;
  status: string;
  /** id del pago en el proveedor. */
  providerPaymentId: string;
}

/**
 * Puerto de cobros. La implementacion real (MercadoPago) se enchufa via DI; si
 * no hay credenciales se usa un stub para no romper dev/tests.
 */
export interface PaymentProvider {
  /** true si hay credenciales reales (no es el stub). */
  isConfigured(): boolean;
  createPreference(input: CreatePreferenceInput): Promise<CreatePreferenceResult>;
  /** Interpreta el payload de un webhook; null si no es interpretable. */
  parseWebhook(payload: Record<string, unknown>): Promise<WebhookResult | null>;
}

export const PAYMENT_PROVIDER = 'PAYMENT_PROVIDER';
