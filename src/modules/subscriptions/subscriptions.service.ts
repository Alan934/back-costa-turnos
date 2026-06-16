import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import {
  NotificationChannel,
  NotificationType,
  PaymentMethod,
  SubscriptionPaymentStatus,
  SubscriptionStatus,
} from '@/common/enums';
import { AppConfig, SubscriptionConfig } from '@/config/configuration';
import { NotificationsService } from '@/modules/notifications/notifications.service';
import { PAYMENT_PROVIDER, PaymentProvider } from '@/modules/payments/ports/payment-provider.port';
import { Account } from '@/modules/identity/entities/account.entity';
import { Professional } from '@/modules/professionals/entities/professional.entity';
import { Subscription } from './entities/subscription.entity';
import { SubscriptionPayment } from './entities/subscription-payment.entity';

const RENEWAL_WARNING_DAYS = 5;
const PERIOD_DAYS = 30;
/** external_reference de las suscripciones en MercadoPago. */
const SUBSCRIPTION_REF_PREFIX = 'sub:';

@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);
  private readonly cfg: SubscriptionConfig;
  private readonly appUrl: string;
  private readonly frontUrl: string;

  constructor(
    @InjectRepository(Subscription)
    private readonly subscriptions: Repository<Subscription>,
    @InjectRepository(SubscriptionPayment)
    private readonly payments: Repository<SubscriptionPayment>,
    @InjectRepository(Professional)
    private readonly professionals: Repository<Professional>,
    @InjectRepository(Account)
    private readonly accounts: Repository<Account>,
    @Inject(PAYMENT_PROVIDER)
    private readonly provider: PaymentProvider,
    private readonly notifications: NotificationsService,
    config: ConfigService,
  ) {
    this.cfg = config.getOrThrow<SubscriptionConfig>('subscription');
    const app = config.getOrThrow<AppConfig>('app');
    this.appUrl = app.appUrl;
    this.frontUrl = app.frontUrl;
  }

  async getByTenant(tenantId: string): Promise<Subscription> {
    const sub = await this.subscriptions.findOne({
      where: { professionalId: tenantId },
    });
    if (!sub) throw new NotFoundException('Suscripcion no encontrada');
    return sub;
  }

  listPayments(subscriptionId: string): Promise<SubscriptionPayment[]> {
    return this.payments.find({
      where: { subscriptionId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Acceso de escritura: permitido durante el trial/periodo vigente y la ventana
   * de gracia. Bloqueado si esta blocked o si vencio el periodo + gracia.
   */
  hasWriteAccess(sub: Subscription, now = new Date()): boolean {
    if (sub.status === SubscriptionStatus.Blocked) return false;
    if (now <= sub.currentPeriodEnd) return true;
    const graceEnd =
      sub.graceEndsAt ?? new Date(sub.currentPeriodEnd.getTime() + this.cfg.graceDays * 86_400_000);
    return now <= graceEnd;
  }

  /**
   * Crea el checkout de MercadoPago para que el PROFESIONAL pague su suscripcion
   * a la plataforma. Devuelve el init_point al que redirigirlo.
   */
  async createCheckout(tenantId: string): Promise<{ initPoint: string }> {
    const sub = await this.getByTenant(tenantId);
    const account = await this.accounts.findOne({
      where: { id: (await this.professionals.findOneOrFail({ where: { id: tenantId } })).accountId },
    });

    const pref = await this.provider.createPreference({
      externalReference: `${SUBSCRIPTION_REF_PREFIX}${sub.id}`,
      description: 'Suscripcion mensual Turnerito',
      amountCents: sub.amountCents,
      payerEmail: account?.email ?? null,
      backUrl: `${this.frontUrl.replace(/\/$/, '')}/app/suscripcion`,
      notificationUrl: `${this.appUrl.replace(/\/$/, '')}/v1/subscription/mp/webhook`,
    });
    return { initPoint: pref.initPoint };
  }

  /** Webhook de MercadoPago para suscripciones: acredita y renueva 30 dias. */
  async handleWebhook(payload: Record<string, unknown>): Promise<void> {
    const result = await this.provider.parseWebhook(payload);
    if (!result?.externalReference?.startsWith(SUBSCRIPTION_REF_PREFIX)) return;
    const subscriptionId = result.externalReference.slice(SUBSCRIPTION_REF_PREFIX.length);
    await this.recordPayment(
      subscriptionId,
      undefined,
      result.paid,
      PaymentMethod.MercadoPago,
      result.providerPaymentId,
    );
  }

  /**
   * Transiciones de estado de suscripcion. Pensado para correr a diario.
   *  active/trial vencido -> past_due (abre ventana de gracia)
   *  past_due/grace vencida -> blocked
   * Ademas dispara el aviso "por vencer".
   */
  async runStateTransitions(now = new Date()): Promise<void> {
    // 1) Vencidas sin pago: active/trial -> past_due con gracia.
    const expired = await this.subscriptions.find({
      where: [
        { status: SubscriptionStatus.Active, currentPeriodEnd: LessThan(now) },
        { status: SubscriptionStatus.Trial, currentPeriodEnd: LessThan(now) },
      ],
    });
    for (const sub of expired) {
      sub.status = SubscriptionStatus.PastDue;
      sub.graceEndsAt = new Date(now.getTime() + this.cfg.graceDays * 86_400_000);
      await this.subscriptions.save(sub);
      await this.notifyStatus(sub);
    }

    // 2) Gracia agotada -> blocked.
    const toBlock = await this.subscriptions.find({
      where: [
        { status: SubscriptionStatus.PastDue, graceEndsAt: LessThan(now) },
        { status: SubscriptionStatus.Grace, graceEndsAt: LessThan(now) },
      ],
    });
    for (const sub of toBlock) {
      sub.status = SubscriptionStatus.Blocked;
      await this.subscriptions.save(sub);
      await this.notifyStatus(sub);
    }

    // 3) Aviso "por vencer" (no es un estado guardado).
    const warnFrom = now;
    const warnTo = new Date(now.getTime() + RENEWAL_WARNING_DAYS * 86_400_000);
    const upcoming = await this.subscriptions.find({
      where: { status: SubscriptionStatus.Active },
    });
    for (const sub of upcoming) {
      if (sub.currentPeriodEnd >= warnFrom && sub.currentPeriodEnd <= warnTo) {
        await this.notifyStatus(sub, 'renewal_warning');
      }
    }

    this.logger.debug(`Transiciones: ${expired.length} past_due, ${toBlock.length} blocked`);
  }

  /**
   * Registra un cobro de suscripcion (desde webhook MP o marca manual del admin)
   * y, si fue pagado, renueva 30 dias.
   */
  async recordPayment(
    subscriptionId: string,
    amountCents: number | undefined,
    paid: boolean,
    method: PaymentMethod,
    mercadopagoRef?: string,
  ): Promise<void> {
    const sub = await this.subscriptions.findOne({ where: { id: subscriptionId } });
    if (!sub) throw new NotFoundException('Suscripcion no encontrada');

    // Idempotencia: MercadoPago reenvia el webhook varias veces por el mismo pago
    // (reintentos + topics payment/merchant_order). Si ya registramos este
    // providerPaymentId, no volvemos a acreditar (evita duplicar historial y apilar dias).
    if (mercadopagoRef) {
      const existing = await this.payments.findOne({ where: { mercadopagoRef } });
      if (existing) {
        this.logger.debug(`Pago MP ${mercadopagoRef} ya registrado; se ignora (idempotencia).`);
        return;
      }
    }

    const periodStart = sub.currentPeriodEnd > new Date() ? sub.currentPeriodEnd : new Date();
    const periodEnd = new Date(periodStart.getTime() + PERIOD_DAYS * 86_400_000);

    await this.payments.save(
      this.payments.create({
        subscriptionId,
        amountCents: amountCents ?? sub.amountCents,
        method,
        status: paid ? SubscriptionPaymentStatus.Paid : SubscriptionPaymentStatus.Failed,
        periodStart,
        periodEnd,
        mercadopagoRef: mercadopagoRef ?? null,
        paidAt: paid ? new Date() : null,
      }),
    );

    if (paid) {
      sub.status = SubscriptionStatus.Active;
      sub.currentPeriodStart = periodStart;
      sub.currentPeriodEnd = periodEnd;
      sub.graceEndsAt = null;
      await this.subscriptions.save(sub);
      await this.notifyStatus(sub, 'payment_received');
    }
  }

  /**
   * Marca el pago en EFECTIVO de un mes (solo admin) y renueva 30 dias.
   * El profesional que se auto-registra paga por MP; solo el admin puede
   * registrar un pago en efectivo.
   */
  async markCashPaid(professionalId: string): Promise<Subscription> {
    const sub = await this.getByTenant(professionalId);
    await this.recordPayment(sub.id, sub.amountCents, true, PaymentMethod.Cash);
    return this.getByTenant(professionalId);
  }

  private async notifyStatus(sub: Subscription, reason?: string): Promise<void> {
    await this.notifications.enqueue({
      professionalId: sub.professionalId,
      channel: NotificationChannel.Email,
      type: NotificationType.Subscription,
      payload: { status: sub.status, reason: reason ?? sub.status },
    });
  }
}
