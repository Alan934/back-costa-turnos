import { Injectable, Logger } from '@nestjs/common';
import {
  CreatePreferenceInput,
  CreatePreferenceResult,
  PaymentProvider,
  WebhookResult,
} from '../ports/payment-provider.port';

/**
 * Stub de MercadoPago para dev/tests sin credenciales. Simula la preferencia y
 * el parseo de webhooks ({ externalRef, status }).
 */
@Injectable()
export class MercadoPagoStubProvider implements PaymentProvider {
  private readonly logger = new Logger(MercadoPagoStubProvider.name);

  isConfigured(): boolean {
    return false;
  }

  createPreference(input: CreatePreferenceInput): Promise<CreatePreferenceResult> {
    const externalRef = `mp-stub-${input.externalReference}`;
    this.logger.log(`[MP stub] preferencia ${externalRef} por ${input.amountCents} centavos`);
    return Promise.resolve({
      externalRef,
      initPoint: `https://sandbox.mercadopago.com/checkout/${externalRef}`,
    });
  }

  parseWebhook(payload: Record<string, unknown>): Promise<WebhookResult | null> {
    const externalReference = payload['externalRef'] ?? payload['external_reference'];
    const status = payload['status'];
    if (typeof externalReference !== 'string') return Promise.resolve(null);
    return Promise.resolve({
      externalReference,
      paid: status === 'approved',
      status: typeof status === 'string' ? status : 'unknown',
      providerPaymentId: typeof payload['id'] === 'string' ? (payload['id'] as string) : 'stub',
    });
  }
}
