import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppointmentStatus, PaymentMethod, PaymentStatus, PaymentType } from '@/common/enums';
import { Appointment } from '@/modules/appointments/entities/appointment.entity';
import { NO_SERVICE_LABEL } from '@/modules/appointments/dto/waiting-room.dto';
import { AppointmentAddon } from '@/modules/appointments/entities/appointment-addon.entity';
import { Service } from '@/modules/catalog/entities/service.entity';
import { computePrice, resolveServiceVat } from '@/modules/catalog/pricing';
import { Professional } from '@/modules/professionals/entities/professional.entity';
import { AuditLog } from '@/modules/legal/entities/audit-log.entity';
import { Payment } from './entities/payment.entity';
import { PaymentsService } from './payments.service';
import { PAYMENT_PROVIDER, PaymentProvider } from './ports/payment-provider.port';
import {
  ChargePaymentDto,
  ChargeQrDto,
  ChargeSummaryDto,
  PaymentAuditEntryDto,
} from './dto/charge.dto';

/** Cobros fuera del sistema: el profesional los confirma a mano (y puede deshacerlos). */
const MANUAL_METHODS = [PaymentMethod.Cash, PaymentMethod.Transfer];
const OPEN_STATUSES = [PaymentStatus.Pending, PaymentStatus.Deferred];

/**
 * Cobro de un turno desde la sala de espera: cuánto falta, QR de Mercado Pago a la
 * cuenta del profesional, "ya pagó" (efectivo / transferencia / pagó antes), pagaré, y
 * deshacer un cobro marcado por error.
 *
 * Todo lo que mueve plata deja una entrada en `audit_log` (quién, cuándo, qué había
 * antes y el motivo). El historial es append-only: deshacer un cobro no borra que se
 * marcó, así un error del profesional es reversible pero nunca invisible.
 */
@Injectable()
export class ChargeService {
  constructor(
    @InjectRepository(Payment) private readonly payments: Repository<Payment>,
    @InjectRepository(Appointment) private readonly appointments: Repository<Appointment>,
    @InjectRepository(AppointmentAddon) private readonly addons: Repository<AppointmentAddon>,
    @InjectRepository(Service) private readonly services: Repository<Service>,
    @InjectRepository(Professional) private readonly professionals: Repository<Professional>,
    @InjectRepository(AuditLog) private readonly auditRepo: Repository<AuditLog>,
    private readonly paymentsService: PaymentsService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
  ) {}

  private async loadAppointment(tenantId: string, id: string): Promise<Appointment> {
    const a = await this.appointments.findOne({ where: { id, professionalId: tenantId } });
    if (!a) throw new NotFoundException('Turno no encontrado');
    if ([AppointmentStatus.Cancelled, AppointmentStatus.NoShow].includes(a.status)) {
      throw new BadRequestException('Un turno cancelado o que no se presentó no se cobra');
    }
    return a;
  }

  /** Valor, cobrado y pendiente del turno. Base sin IVA; el IVA solo aplica a Mercado Pago. */
  async summary(tenantId: string, appointmentId: string): Promise<ChargeSummaryDto> {
    const apt = await this.loadAppointment(tenantId, appointmentId);
    const [service, addons, payments, pro] = await Promise.all([
      apt.serviceId ? this.services.findOne({ where: { id: apt.serviceId } }) : null,
      this.addons.find({ where: { appointmentId: apt.id } }),
      this.payments.find({ where: { appointmentId: apt.id }, order: { createdAt: 'ASC' } }),
      this.professionals.findOne({ where: { id: tenantId } }),
    ]);

    const addonsCents = addons.reduce(
      (acc, a) =>
        acc + (a.isFree ? 0 : Math.max(0, a.priceAtBookingCents - a.discountAppliedCents)),
      0,
    );
    const totalCents = (service?.priceCents ?? 0) + addonsCents;
    // Lo cobrado por Mercado Pago incluye IVA; para comparar contra el valor del turno
    // se descuenta la porción de IVA.
    const paidCents = payments
      .filter((p) => p.status === PaymentStatus.Paid)
      .reduce((acc, p) => acc + (p.amountCents - p.vatAmountCents), 0);
    const dueCents = Math.max(0, totalCents - paidCents);

    const vat = service ? resolveServiceVat(service, pro) : { percent: 0, chargedToClient: false };
    const dueMpCents = computePrice(dueCents, vat.percent, vat.chargedToClient).totalCents;

    return {
      appointmentId: apt.id,
      serviceName: service?.name ?? NO_SERVICE_LABEL,
      totalCents,
      paidCents,
      dueCents,
      dueMpCents,
      fullyPaid: dueCents === 0 && totalCents > 0,
      // En modo stub (desarrollo, sin credenciales) siempre se puede probar el QR.
      mpConnected: !this.provider.isConfigured() || !!pro?.mpUserId,
      payments: payments.map((p) => this.toPaymentDto(p)),
    };
  }

  private toPaymentDto(p: Payment): ChargePaymentDto {
    return {
      id: p.id,
      method: p.method,
      status: p.status,
      type: p.type,
      amountCents: p.amountCents,
      paidAt: p.paidAt ? p.paidAt.toISOString() : null,
      note: p.note,
      revertible: MANUAL_METHODS.includes(p.method) && p.status === PaymentStatus.Paid,
    };
  }

  /**
   * QR de cobro: crea (o reutiliza) un pago pendiente por Mercado Pago por lo que falta
   * y devuelve el `initPoint`. El cliente escanea, paga, y el webhook lo marca pagado
   * directo en la cuenta de Mercado Pago del profesional con el monto exacto.
   */
  async createQr(tenantId: string, accountId: string, appointmentId: string): Promise<ChargeQrDto> {
    const sum = await this.summary(tenantId, appointmentId);
    if (sum.fullyPaid || sum.dueMpCents <= 0) {
      throw new BadRequestException('No hay nada para cobrar: el turno ya está pago.');
    }
    if (!sum.mpConnected) {
      throw new BadRequestException(
        'Conectá tu cuenta de Mercado Pago en Cobros para cobrar con QR.',
      );
    }
    const apt = await this.loadAppointment(tenantId, appointmentId);
    const vatAmountCents = sum.dueMpCents - sum.dueCents;

    // Un solo intento abierto por turno: si el profesional vuelve a abrir el QR (o cambió
    // el monto porque se sumó un pago) se reusa la fila en vez de acumular pendientes.
    const existing = await this.payments.findOne({
      where: {
        appointmentId: apt.id,
        method: PaymentMethod.MercadoPago,
        status: PaymentStatus.Pending,
      },
    });
    const payment =
      existing ??
      this.payments.create({
        professionalId: tenantId,
        appointmentId: apt.id,
        personId: apt.personId,
        type: PaymentType.Service,
        method: PaymentMethod.MercadoPago,
        status: PaymentStatus.Pending,
      });
    payment.amountCents = sum.dueMpCents;
    payment.vatAmountCents = vatAmountCents;
    payment.vatPercent =
      sum.dueCents > 0 ? Math.round((vatAmountCents / sum.dueCents) * 10000) / 100 : 0;
    const saved = await this.payments.save(payment);

    const { initPoint } = await this.paymentsService.createMercadoPagoPreference(
      tenantId,
      saved.id,
    );
    await this.paymentsService.audit({
      tenantId,
      accountId,
      action: 'payment.mp_qr',
      paymentId: saved.id,
      metadata: { appointmentId: apt.id, amountCents: saved.amountCents },
    });
    return { paymentId: saved.id, initPoint, amountCents: saved.amountCents };
  }

  /**
   * "Ya pagó" (efectivo, transferencia, o pagó antes por su cuenta). Salda los cobros
   * pendientes del turno y, si todavía falta, registra el resto como un pago nuevo.
   * Idempotente: si ya no falta nada no crea otro pago (un doble toque no duplica ingresos).
   */
  async markPaid(
    tenantId: string,
    accountId: string,
    appointmentId: string,
    method: 'cash' | 'transfer',
    note?: string,
  ): Promise<ChargeSummaryDto> {
    const before = await this.summary(tenantId, appointmentId);
    if (before.fullyPaid) return before;
    const apt = await this.loadAppointment(tenantId, appointmentId);
    const chosen = method === 'cash' ? PaymentMethod.Cash : PaymentMethod.Transfer;
    const now = new Date();

    const rows = await this.payments.find({ where: { appointmentId: apt.id } });

    // 1) Pendientes/pagarés manuales de este turno: ahora están pagos.
    for (const p of rows.filter(
      (r) => MANUAL_METHODS.includes(r.method) && OPEN_STATUSES.includes(r.status),
    )) {
      const previous = { status: p.status, method: p.method };
      p.status = PaymentStatus.Paid;
      p.method = chosen;
      p.paidAt = now;
      p.note = note ?? null;
      await this.payments.save(p);
      await this.paymentsService.audit({
        tenantId,
        accountId,
        action: 'payment.mark_paid',
        paymentId: p.id,
        metadata: {
          via: 'charge',
          method,
          note: note ?? null,
          previous,
          amountCents: p.amountCents,
        },
      });
    }

    // 2) Un QR de Mercado Pago que quedó abierto ya no corresponde: se cobró por otra vía.
    for (const p of rows.filter(
      (r) => r.method === PaymentMethod.MercadoPago && r.status === PaymentStatus.Pending,
    )) {
      p.status = PaymentStatus.Failed;
      await this.payments.save(p);
      await this.paymentsService.audit({
        tenantId,
        accountId,
        action: 'payment.superseded',
        paymentId: p.id,
        metadata: { reason: `Se cobró por ${method} desde la sala`, amountCents: p.amountCents },
      });
    }

    // 3) Si después de saldar lo pendiente todavía falta, el resto entra como pago nuevo.
    const mid = await this.summary(tenantId, appointmentId);
    if (mid.dueCents > 0) {
      const created = await this.payments.save(
        this.payments.create({
          professionalId: tenantId,
          appointmentId: apt.id,
          personId: apt.personId,
          type: PaymentType.Service,
          method: chosen,
          status: PaymentStatus.Paid,
          amountCents: mid.dueCents,
          paidAt: now,
          note: note ?? null,
        }),
      );
      await this.paymentsService.audit({
        tenantId,
        accountId,
        action: 'payment.mark_paid',
        paymentId: created.id,
        metadata: {
          via: 'charge',
          method,
          note: note ?? null,
          created: true,
          amountCents: created.amountCents,
        },
      });
    }
    return this.summary(tenantId, appointmentId);
  }

  /** Pagaré: el cliente se fue sin pagar y quedó debiendo lo que falta. */
  async markDeferred(
    tenantId: string,
    accountId: string,
    appointmentId: string,
    note?: string,
  ): Promise<ChargeSummaryDto> {
    const before = await this.summary(tenantId, appointmentId);
    if (before.fullyPaid) return before;
    const apt = await this.loadAppointment(tenantId, appointmentId);
    const rows = await this.payments.find({ where: { appointmentId: apt.id } });
    const open = rows.filter(
      (r) => MANUAL_METHODS.includes(r.method) && OPEN_STATUSES.includes(r.status),
    );

    if (open.length > 0) {
      for (const p of open) {
        p.status = PaymentStatus.Deferred;
        p.paidAt = null;
        p.note = note ?? null;
        await this.payments.save(p);
        await this.paymentsService.audit({
          tenantId,
          accountId,
          action: 'payment.mark_deferred',
          paymentId: p.id,
          metadata: { via: 'charge', note: note ?? null, amountCents: p.amountCents },
        });
      }
    } else {
      const created = await this.payments.save(
        this.payments.create({
          professionalId: tenantId,
          appointmentId: apt.id,
          personId: apt.personId,
          type: PaymentType.Service,
          method: PaymentMethod.Cash,
          status: PaymentStatus.Deferred,
          amountCents: before.dueCents,
          note: note ?? null,
        }),
      );
      await this.paymentsService.audit({
        tenantId,
        accountId,
        action: 'payment.mark_deferred',
        paymentId: created.id,
        metadata: {
          via: 'charge',
          note: note ?? null,
          created: true,
          amountCents: created.amountCents,
        },
      });
    }
    return this.summary(tenantId, appointmentId);
  }

  /**
   * Deshace un cobro marcado como pagado (el profesional se equivocó). Vuelve a
   * "pendiente de cobro", no se borra. Solo cobros manuales: un pago de Mercado Pago ya
   * tiene plata acreditada y revertirlo acá dejaría la contabilidad inconsistente; si hay
   * que devolverla se hace desde Mercado Pago.
   *
   * Exige un motivo y queda en el historial con quién lo hizo y cuándo: la protección
   * contra el abuso (marcar pagado, cobrar de otro modo y deshacer) no es impedirlo sino
   * que siempre sea rastreable, junto al comprobante que conserva el cliente.
   */
  async revert(
    tenantId: string,
    accountId: string,
    paymentId: string,
    reason: string,
  ): Promise<ChargePaymentDto> {
    const p = await this.paymentsService.findById(tenantId, paymentId);
    if (p.method === PaymentMethod.MercadoPago) {
      throw new BadRequestException(
        'Un pago de Mercado Pago no se deshace desde acá. Si hay que devolverlo, hacelo desde tu cuenta de Mercado Pago.',
      );
    }
    if (p.status !== PaymentStatus.Paid) {
      throw new BadRequestException('Solo se deshacen cobros marcados como pagados');
    }
    const previous = {
      status: p.status,
      method: p.method,
      paidAt: p.paidAt?.toISOString() ?? null,
    };
    p.status = PaymentStatus.Pending;
    p.paidAt = null;
    const saved = await this.payments.save(p);
    await this.paymentsService.audit({
      tenantId,
      accountId,
      action: 'payment.revert',
      paymentId: saved.id,
      metadata: { reason: reason.trim(), previous, amountCents: saved.amountCents },
    });
    return this.toPaymentDto(saved);
  }

  /** Historial completo de un pago (quién hizo qué y cuándo). */
  async auditOf(tenantId: string, paymentId: string): Promise<PaymentAuditEntryDto[]> {
    await this.paymentsService.findById(tenantId, paymentId); // valida que sea del tenant
    const rows = await this.auditRepo.find({
      where: { entity: 'payment', entityId: paymentId, professionalId: tenantId },
      order: { createdAt: 'ASC' },
    });
    return rows.map((r) => ({
      action: r.action,
      createdAt: r.createdAt.toISOString(),
      accountId: r.accountId,
      metadata: r.metadata,
    }));
  }
}
