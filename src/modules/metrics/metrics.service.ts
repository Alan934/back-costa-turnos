import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, In, Repository } from 'typeorm';
import { DateTime } from 'luxon';
import { AppointmentStatus, PaymentMethod, PaymentStatus } from '@/common/enums';
import { Appointment } from '@/modules/appointments/entities/appointment.entity';
import { Person } from '@/modules/identity/entities/person.entity';
import { Professional } from '@/modules/professionals/entities/professional.entity';
import { Payment } from '@/modules/payments/entities/payment.entity';
import { MetricsOverviewDto, MetricsRange } from './dto/metrics.dto';

interface Bucket {
  label: string;
  start: number; // epoch ms (inclusive)
  end: number; // epoch ms (inclusive)
}

const WEEKDAY_ES = ['', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const AT_RISK_DAYS = 45;
const AT_RISK_LIMIT = 5;

@Injectable()
export class MetricsService {
  constructor(
    @InjectRepository(Appointment)
    private readonly appointments: Repository<Appointment>,
    @InjectRepository(Person)
    private readonly persons: Repository<Person>,
    @InjectRepository(Professional)
    private readonly professionals: Repository<Professional>,
    @InjectRepository(Payment)
    private readonly payments: Repository<Payment>,
  ) {}

  async getOverview(tenantId: string, range: MetricsRange): Promise<MetricsOverviewDto> {
    const professional = await this.professionals.findOne({ where: { id: tenantId } });
    const tz = professional?.timezone ?? 'America/Argentina/Buenos_Aires';
    const now = DateTime.now().setZone(tz);

    const buckets = this.buildBuckets(now, range);
    const periodStart = buckets[0].start;
    const periodEnd = now.toMillis();

    // Todos los turnos del tenant (para primera/ultima visita por persona).
    const all = await this.appointments.find({
      where: { professionalId: tenantId },
      select: ['id', 'personId', 'startAt', 'status', 'serviceId'],
    });

    // Ingresos: solo pagos efectivamente cobrados (Paid), por fecha de cobro. Incluye
    // señas, MercadoPago y efectivo confirmado; el efectivo no cobrado/pagaré no suma.
    // Se excluye el IVA (pass-through para cubrir la comisión MP): ingreso = base.
    const paidPayments = await this.payments.find({
      where: {
        professionalId: tenantId,
        status: PaymentStatus.Paid,
        paidAt: Between(new Date(periodStart), new Date(periodEnd)),
      },
      select: ['amountCents', 'vatAmountCents', 'paidAt'],
    });
    // Cobros fuera de sistema pendientes (efectivo/transferencia, pendiente + pagaré),
    // no acotado al período. Sin IVA, así que amountCents = base.
    const unpaidCash = await this.payments.find({
      where: {
        professionalId: tenantId,
        method: In([PaymentMethod.Cash, PaymentMethod.Transfer]),
        status: In([PaymentStatus.Pending, PaymentStatus.Deferred]),
      },
      select: ['amountCents'],
    });
    const pendingCashCents = unpaidCash.reduce((acc, p) => acc + p.amountCents, 0);

    const firstByPerson = new Map<string, number>();
    const lastByPerson = new Map<string, number>();
    for (const a of all) {
      const t = a.startAt.getTime();
      if (!firstByPerson.has(a.personId) || t < firstByPerson.get(a.personId)!) {
        firstByPerson.set(a.personId, t);
      }
      if (!lastByPerson.has(a.personId) || t > lastByPerson.get(a.personId)!) {
        lastByPerson.set(a.personId, t);
      }
    }

    const inPeriod = all.filter((a) => {
      const t = a.startAt.getTime();
      return t >= periodStart && t <= periodEnd;
    });

    // attendanceByDay + incomeByDay
    const attendanceByDay = buckets.map((b) => {
      const slice = inPeriod.filter(
        (a) => a.startAt.getTime() >= b.start && a.startAt.getTime() <= b.end,
      );
      return {
        label: b.label,
        atendidos: slice.filter((a) => a.status === AppointmentStatus.Done).length,
        cancelados: slice.filter((a) => a.status === AppointmentStatus.Cancelled).length,
        noShow: slice.filter((a) => a.status === AppointmentStatus.NoShow).length,
      };
    });
    const incomeByDay = buckets.map((b) => {
      const cents = paidPayments
        .filter((p) => {
          const t = p.paidAt?.getTime() ?? 0;
          return t >= b.start && t <= b.end;
        })
        .reduce((acc, p) => acc + (p.amountCents - p.vatAmountCents), 0);
      return { label: b.label, cents };
    });

    // peakHours (en la TZ del tenant)
    const hourCounts = new Map<number, number>();
    for (const a of inPeriod) {
      const h = DateTime.fromJSDate(a.startAt).setZone(tz).hour;
      hourCounts.set(h, (hourCounts.get(h) ?? 0) + 1);
    }
    const peakHours = [...hourCounts.entries()]
      .sort(([h1], [h2]) => h1 - h2)
      .map(([hour, turnos]) => ({ hour: `${String(hour).padStart(2, '0')}h`, turnos }));

    // newVsReturning
    const personsInPeriod = new Set(inPeriod.map((a) => a.personId));
    let nuevos = 0;
    let recurrentes = 0;
    for (const personId of personsInPeriod) {
      if ((firstByPerson.get(personId) ?? 0) >= periodStart) nuevos += 1;
      else recurrentes += 1;
    }

    // totals
    const noShowCount = inPeriod.filter((a) => a.status === AppointmentStatus.NoShow).length;
    const totals = {
      appointments: inPeriod.length,
      incomeCents: incomeByDay.reduce((acc, d) => acc + d.cents, 0),
      pendingCashCents,
      newClients: nuevos,
      noShowRate: inPeriod.length ? +(noShowCount / inPeriod.length).toFixed(2) : 0,
    };

    // atRiskClients: ultima visita hace mas de AT_RISK_DAYS
    const cutoff = now.minus({ days: AT_RISK_DAYS }).toMillis();
    const atRiskIds = [...lastByPerson.entries()]
      .filter(([, last]) => last < cutoff)
      .sort(([, a], [, b]) => a - b)
      .slice(0, AT_RISK_LIMIT);
    const riskPersons = atRiskIds.length
      ? await this.persons.find({
          where: atRiskIds.map(([id]) => ({ id })),
          select: ['id', 'fullName'],
        })
      : [];
    const nameById = new Map(riskPersons.map((p) => [p.id, p.fullName]));
    const atRiskClients = atRiskIds.map(([id, last]) => ({
      id,
      fullName: nameById.get(id) ?? 'Cliente',
      lastVisitLabel:
        DateTime.fromMillis(last).setZone(tz).setLocale('es').toRelative({ base: now }) ??
        'hace mucho',
    }));

    return {
      range,
      attendanceByDay,
      newVsReturning: { nuevos, recurrentes },
      peakHours,
      incomeByDay,
      totals,
      atRiskClients,
    };
  }

  /** Buckets diarios (week, 7) o semanales (month, 4) terminando hoy, en la TZ dada. */
  private buildBuckets(now: DateTime, range: MetricsRange): Bucket[] {
    if (range === MetricsRange.Month) {
      return Array.from({ length: 4 }, (_, i) => {
        const endDay = now.minus({ days: (3 - i) * 7 });
        return {
          label: `Sem ${i + 1}`,
          start: endDay.minus({ days: 6 }).startOf('day').toMillis(),
          end: endDay.endOf('day').toMillis(),
        };
      });
    }
    return Array.from({ length: 7 }, (_, i) => {
      const day = now.minus({ days: 6 - i });
      return {
        label: WEEKDAY_ES[day.weekday],
        start: day.startOf('day').toMillis(),
        end: day.endOf('day').toMillis(),
      };
    });
  }
}
