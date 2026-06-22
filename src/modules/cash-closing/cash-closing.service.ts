import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, LessThan, MoreThanOrEqual, Repository } from 'typeorm';
import { DateTime } from 'luxon';
import { AppointmentStatus, PaymentMethod, PaymentStatus } from '@/common/enums';
import { Appointment } from '@/modules/appointments/entities/appointment.entity';
import { Payment } from '@/modules/payments/entities/payment.entity';
import { Service } from '@/modules/catalog/entities/service.entity';
import { Person } from '@/modules/identity/entities/person.entity';
import { Professional } from '@/modules/professionals/entities/professional.entity';
import { MetricsRange } from '@/modules/metrics/dto/metrics.dto';
import { CashClosingDto, PendingCashDto, PendingCompletionDto } from './dto/cash-closing.dto';

// Turnos que ocupan agenda y deberían haberse cerrado (pasado su fin).
const OPEN_STATUSES = [AppointmentStatus.Confirmed, AppointmentStatus.InProgress];
// Métodos de cobro fuera del sistema (el profesional confirma el cobro): efectivo + transferencia.
const OFF_SYSTEM_METHODS = [PaymentMethod.Cash, PaymentMethod.Transfer];
// Pagos fuera de sistema aún no cobrados.
const UNPAID_CASH = [PaymentStatus.Pending, PaymentStatus.Deferred];

@Injectable()
export class CashClosingService {
  constructor(
    @InjectRepository(Appointment)
    private readonly appointments: Repository<Appointment>,
    @InjectRepository(Payment)
    private readonly payments: Repository<Payment>,
    @InjectRepository(Service)
    private readonly services: Repository<Service>,
    @InjectRepository(Person)
    private readonly persons: Repository<Person>,
    @InjectRepository(Professional)
    private readonly professionals: Repository<Professional>,
  ) {}

  async getClosing(tenantId: string, range: MetricsRange): Promise<CashClosingDto> {
    const now = new Date();

    const [openAppointments, unpaidCash] = await Promise.all([
      this.appointments.find({
        where: { professionalId: tenantId, status: In(OPEN_STATUSES), endAt: LessThan(now) },
        order: { startAt: 'ASC' },
      }),
      this.payments.find({
        where: {
          professionalId: tenantId,
          method: In(OFF_SYSTEM_METHODS),
          status: In(UNPAID_CASH),
        },
        order: { createdAt: 'DESC' },
      }),
    ]);

    // Carga nombres de servicio/cliente y la fecha del turno asociado en lote.
    const appointmentIds = [
      ...new Set(unpaidCash.map((p) => p.appointmentId).filter((x): x is string => !!x)),
    ];
    const cashAppointments = appointmentIds.length
      ? await this.appointments.find({ where: { id: In(appointmentIds) } })
      : [];
    const apptById = new Map(cashAppointments.map((a) => [a.id, a]));

    const serviceIds = [
      ...new Set([
        ...openAppointments.map((a) => a.serviceId),
        ...cashAppointments.map((a) => a.serviceId),
      ]),
    ];
    const personIds = [
      ...new Set([
        ...openAppointments.map((a) => a.personId),
        ...unpaidCash.map((p) => p.personId),
      ]),
    ];
    const [services, persons] = await Promise.all([
      serviceIds.length ? this.services.find({ where: { id: In(serviceIds) } }) : [],
      personIds.length ? this.persons.find({ where: { id: In(personIds) } }) : [],
    ]);
    const serviceNameById = new Map(services.map((s) => [s.id, s.name]));
    const personNameById = new Map(persons.map((p) => [p.id, p.fullName]));

    const pendingCompletion: PendingCompletionDto[] = openAppointments.map((a) => ({
      appointmentId: a.id,
      personName: personNameById.get(a.personId) ?? 'Cliente',
      serviceName: serviceNameById.get(a.serviceId) ?? 'Servicio',
      startAt: a.startAt.toISOString(),
      endAt: a.endAt.toISOString(),
      status: a.status,
    }));

    const pendingCash: PendingCashDto[] = unpaidCash.map((p) => {
      const appt = p.appointmentId ? apptById.get(p.appointmentId) : undefined;
      return {
        paymentId: p.id,
        appointmentId: p.appointmentId,
        personName: personNameById.get(p.personId) ?? 'Cliente',
        serviceName: appt ? (serviceNameById.get(appt.serviceId) ?? 'Servicio') : 'Servicio',
        amountCents: p.amountCents,
        status: p.status,
        appointmentStartAt: appt ? appt.startAt.toISOString() : null,
        note: p.note,
      };
    });
    const pendingCashCents = unpaidCash.reduce((acc, p) => acc + p.amountCents, 0);

    // Total cobrado en efectivo en el período (por fecha de cobro), en la TZ del pro.
    const periodStart = await this.periodStart(tenantId, range);
    const collectedPayments = await this.payments.find({
      where: {
        professionalId: tenantId,
        method: In(OFF_SYSTEM_METHODS),
        status: PaymentStatus.Paid,
        paidAt: MoreThanOrEqual(periodStart),
      },
    });
    const collected = {
      count: collectedPayments.length,
      totalCents: collectedPayments.reduce((acc, p) => acc + p.amountCents, 0),
    };

    return { pendingCompletion, pendingCash, pendingCashCents, collected };
  }

  /** Inicio del período (week = 7 días, month = 30 días) en la zona del profesional. */
  private async periodStart(tenantId: string, range: MetricsRange): Promise<Date> {
    const professional = await this.professionals.findOne({ where: { id: tenantId } });
    const tz = professional?.timezone ?? 'America/Argentina/Buenos_Aires';
    const days = range === MetricsRange.Month ? 30 : 7;
    return DateTime.now()
      .setZone(tz)
      .minus({ days: days - 1 })
      .startOf('day')
      .toJSDate();
  }
}
