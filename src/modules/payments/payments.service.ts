import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaymentMethod, PaymentStatus } from '@/common/enums';
import { AppConfig, MercadoPagoConfig } from '@/config/configuration';
import { Professional } from '@/modules/professionals/entities/professional.entity';
import { Payment } from './entities/payment.entity';
import { PAYMENT_PROVIDER, PaymentProvider } from './ports/payment-provider.port';
import { AppointmentConfirmer } from './ports/appointment-confirmer.port';
import { MercadoPagoOAuthService } from './providers/mercadopago-oauth.service';

/** external_reference de las señas/turnos en MercadoPago. */
const PAYMENT_REF_PREFIX = 'pay:';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly mp: MercadoPagoConfig;
  private readonly backendUrl: string;
  /**
   * Confirmador de reservas (AppointmentsService). Se registra en runtime para
   * evitar la dependencia circular PaymentsModule -> AppointmentsModule. Si no
   * está registrado, el webhook solo marca el pago (sin crear el turno).
   */
  private confirmer?: AppointmentConfirmer;

  constructor(
    @InjectRepository(Payment)
    private readonly payments: Repository<Payment>,
    @InjectRepository(Professional)
    private readonly professionals: Repository<Professional>,
    @Inject(PAYMENT_PROVIDER)
    private readonly provider: PaymentProvider,
    private readonly oauth: MercadoPagoOAuthService,
    config: ConfigService,
  ) {
    this.mp = config.getOrThrow<MercadoPagoConfig>('mercadopago');
    this.backendUrl = config.getOrThrow<AppConfig>('app').appUrl;
  }

  /** AppointmentsService se registra aquí en su onModuleInit (ver port). */
  registerAppointmentConfirmer(confirmer: AppointmentConfirmer): void {
    this.confirmer = confirmer;
  }

  list(tenantId: string): Promise<Payment[]> {
    return this.payments.find({
      where: { professionalId: tenantId },
      order: { createdAt: 'DESC' },
      take: 500,
    });
  }

  async findById(tenantId: string, id: string): Promise<Payment> {
    const payment = await this.payments.findOne({
      where: { id, professionalId: tenantId },
    });
    if (!payment) throw new NotFoundException('Pago no encontrado');
    return payment;
  }

  /**
   * Marca un pago en efectivo como cobrado (lo hace el profesional). Admite venir de
   * un pago pendiente o de un pagaré (Deferred) que el cliente finalmente pagó.
   */
  async markCashPaid(tenantId: string, id: string): Promise<Payment> {
    const payment = await this.findById(tenantId, id);
    if (payment.method !== PaymentMethod.Cash) {
      throw new BadRequestException('Solo se marcan manualmente los pagos en efectivo');
    }
    if (![PaymentStatus.Pending, PaymentStatus.Deferred].includes(payment.status)) {
      throw new BadRequestException('El pago no está pendiente de cobro');
    }
    payment.status = PaymentStatus.Paid;
    payment.paidAt = new Date();
    payment.note = null;
    return this.payments.save(payment);
  }

  /**
   * Marca un pago en efectivo como pagaré (el cliente quedó debiendo / pagará después).
   * No cuenta como ingreso; aparece en el cierre de caja como pendiente de cobro.
   */
  async markCashDeferred(tenantId: string, id: string, note?: string): Promise<Payment> {
    const payment = await this.findById(tenantId, id);
    if (payment.method !== PaymentMethod.Cash) {
      throw new BadRequestException('Solo se difieren los pagos en efectivo');
    }
    if (![PaymentStatus.Pending, PaymentStatus.Deferred].includes(payment.status)) {
      throw new BadRequestException('El pago ya no está pendiente de cobro');
    }
    payment.status = PaymentStatus.Deferred;
    payment.paidAt = null;
    payment.note = note ?? null;
    return this.payments.save(payment);
  }

  /**
   * Crea una preferencia de MercadoPago para un pago pendiente (seña/turno).
   * El cobro entra a la cuenta del PROFESIONAL (marketplace); la plataforma
   * puede quedarse una comision (MP_MARKETPLACE_FEE_PERCENT).
   */
  async createMercadoPagoPreference(
    tenantId: string,
    id: string,
    payerEmail?: string | null,
  ): Promise<{ initPoint: string }> {
    const payment = await this.findById(tenantId, id);
    if (payment.status === PaymentStatus.Paid) {
      throw new BadRequestException('El pago ya esta acreditado');
    }

    const sellerToken = await this.getSellerAccessToken(tenantId);
    const feeCents = Math.round((payment.amountCents * this.mp.marketplaceFeePercent) / 100);

    const pref = await this.provider.createPreference({
      externalReference: `${PAYMENT_REF_PREFIX}${payment.id}`,
      description: `Pago ${payment.type}`,
      amountCents: payment.amountCents,
      payerEmail,
      sellerAccessToken: sellerToken,
      marketplaceFeeCents: feeCents,
      backUrl: `${this.mp.frontReturnUrl.replace(/\/$/, '')}/reserva/resultado`,
      notificationUrl: `${this.backendUrl.replace(/\/$/, '')}/v1/payments/mp/webhook`,
    });

    payment.mercadopagoRef = pref.externalRef;
    payment.method = PaymentMethod.MercadoPago;
    await this.payments.save(payment);
    return { initPoint: pref.initPoint };
  }

  /**
   * Webhook de MercadoPago para señas/turnos. Idempotente. Identifica el pago
   * por external_reference ("pay:<id>") o, en su defecto, por mercadopago_ref.
   */
  async handleWebhook(payload: Record<string, unknown>): Promise<void> {
    const result = await this.provider.parseWebhook(payload);
    if (!result) {
      this.logger.warn('Webhook MP no interpretable');
      return;
    }

    const ref = result.externalReference;
    if (ref && !ref.startsWith(PAYMENT_REF_PREFIX)) {
      // No es un pago de seña/turno (p. ej. suscripcion); lo ignora este handler.
      return;
    }
    const paymentId = ref ? ref.slice(PAYMENT_REF_PREFIX.length) : null;

    const payment = paymentId
      ? await this.payments.findOne({ where: { id: paymentId } })
      : await this.payments.findOne({ where: { mercadopagoRef: result.providerPaymentId } });

    if (!payment) {
      this.logger.warn(`Webhook MP: pago ${ref ?? result.providerPaymentId} no encontrado`);
      return;
    }
    if (payment.status === PaymentStatus.Paid) return; // idempotencia

    payment.mercadopagoRef = result.providerPaymentId;
    if (result.paid) {
      payment.status = PaymentStatus.Paid;
      payment.paidAt = new Date();
      await this.payments.save(payment);
      // F4: si el turno aún no existe (flujo MercadoPago), se crea recién ahora a
      // partir del pending_booking. Idempotente del lado del confirmer.
      if (!payment.appointmentId && this.confirmer) {
        await this.confirmer.confirmPaidBooking(payment);
      }
    } else {
      payment.status = PaymentStatus.Failed;
      await this.payments.save(payment);
      // Pago rechazado: libera el hold del horario (si había pending_booking).
      if (!payment.appointmentId && this.confirmer) {
        await this.confirmer.releasePending(payment.id);
      }
    }
  }

  /**
   * Devuelve el access token del profesional para cobrar a su cuenta. Refresca
   * el token si esta por vencer. Lanza si el profesional no conecto su MP.
   */
  private async getSellerAccessToken(tenantId: string): Promise<string | null> {
    if (!this.provider.isConfigured()) {
      // Modo stub: no hace falta token real.
      return null;
    }
    const professional = await this.professionals
      .createQueryBuilder('p')
      .addSelect(['p.mpAccessToken', 'p.mpRefreshToken'])
      .where('p.id = :id', { id: tenantId })
      .getOne();

    if (!professional?.mpAccessToken) {
      throw new BadRequestException(
        'El profesional no conecto su cuenta de MercadoPago. Conectala para cobrar online.',
      );
    }

    const expiresSoon =
      professional.mpTokenExpiresAt &&
      professional.mpTokenExpiresAt.getTime() - Date.now() < 60 * 60 * 1000;

    if (expiresSoon && professional.mpRefreshToken && this.oauth.isConfigured()) {
      try {
        const conn = await this.oauth.refresh(professional.mpRefreshToken);
        await this.professionals.update(tenantId, {
          mpAccessToken: conn.accessToken,
          mpRefreshToken: conn.refreshToken ?? professional.mpRefreshToken,
          mpPublicKey: conn.publicKey ?? professional.mpPublicKey,
          mpTokenExpiresAt: conn.expiresAt,
        });
        return conn.accessToken ?? professional.mpAccessToken;
      } catch (err) {
        this.logger.warn(`No se pudo refrescar el token MP del tenant ${tenantId}: ${String(err)}`);
      }
    }
    return professional.mpAccessToken;
  }
}
