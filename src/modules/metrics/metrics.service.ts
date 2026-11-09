import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, In, LessThan, LessThanOrEqual, MoreThanOrEqual, Repository } from 'typeorm';
import { DateTime } from 'luxon';
import {
  AppointmentStatus,
  AttendanceMode,
  CreatedVia,
  MembershipStatus,
  PaymentMethod,
  PaymentStatus,
  ScheduleRuleKind,
} from '@/common/enums';
import { Appointment } from '@/modules/appointments/entities/appointment.entity';
import { NO_SERVICE_LABEL } from '@/modules/appointments/dto/waiting-room.dto';
import { Professional } from '@/modules/professionals/entities/professional.entity';
import { Payment } from '@/modules/payments/entities/payment.entity';
import { Service } from '@/modules/catalog/entities/service.entity';
import { Membership } from '@/modules/comercios/entities/membership.entity';
import { Comercio } from '@/modules/comercios/entities/comercio.entity';
import { ScheduleRule } from '@/modules/availability/entities/schedule-rule.entity';
import { TimeOff } from '@/modules/availability/entities/time-off.entity';
import { HolidaysService } from '@/modules/holidays/holidays.service';
import {
  AtRiskClientDto,
  ComercioTeamMetricsDto,
  TeamMemberMetricsDto,
  MetricsOverviewDto,
  MetricsPeriodDto,
  MetricsRange,
  MetricsTotalsDto,
  PeakHourDto,
  ServiceMetricsDto,
} from './dto/metrics.dto';
import { Period, previousPeriod, resolvePeriod } from './metrics-period';

const WEEKDAY_ES = ['', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
/** Sin venir hace más de esto (y sin turno próximo) = "dejó de venir". */
const AT_RISK_DAYS = 45;
/** Más allá de esto se lo da por perdido y no se lista (no tiene sentido insistir). */
const LOST_AFTER_DAYS = 365;
const AT_RISK_LIMIT = 5;
/** Turnos que, pasado su fin, deberían haberse cerrado (igual que en Cierre de caja). */
const OPEN_STATUSES = [AppointmentStatus.Confirmed, AppointmentStatus.InProgress];
const OFF_SYSTEM_METHODS = [PaymentMethod.Cash, PaymentMethod.Transfer];
const UNPAID_CASH = [PaymentStatus.Pending, PaymentStatus.Deferred];

interface TeamPaymentRow {
  amount_cents: number;
  vat_amount_cents: number;
  paid_at: Date;
  membership_id: string;
}

/** Intervalo en minutos desde el inicio del día: [desde, hasta). */
type Interval = [number, number];

interface ScheduleData {
  memberships: Membership[];
  rules: ScheduleRule[];
  timeOffs: TimeOff[];
  /** `${membershipId}|YYYY-MM-DD` de los feriados que no trabaja. */
  blockedHolidays: Set<string>;
}

@Injectable()
export class MetricsService {
  constructor(
    @InjectRepository(Appointment)
    private readonly appointments: Repository<Appointment>,
    @InjectRepository(Professional)
    private readonly professionals: Repository<Professional>,
    @InjectRepository(Payment)
    private readonly payments: Repository<Payment>,
    @InjectRepository(Service)
    private readonly services: Repository<Service>,
    @InjectRepository(Membership)
    private readonly memberships: Repository<Membership>,
    @InjectRepository(Comercio)
    private readonly comercios: Repository<Comercio>,
    @InjectRepository(ScheduleRule)
    private readonly rules: Repository<ScheduleRule>,
    @InjectRepository(TimeOff)
    private readonly timeOffs: Repository<TimeOff>,
    private readonly holidays: HolidaysService,
  ) {}

  async getOverview(
    tenantId: string,
    range: MetricsRange,
    offset = 0,
  ): Promise<MetricsOverviewDto> {
    const professional = await this.professionals.findOne({ where: { id: tenantId } });
    const tz = professional?.timezone ?? 'America/Argentina/Buenos_Aires';
    const now = DateTime.now().setZone(tz);

    const current = resolvePeriod(now, range, offset);
    const previous = previousPeriod(current, range);
    const from = previous.start.toJSDate();
    const until = current.until.toJSDate();

    // Solo los turnos y cobros de los dos períodos (actual + anterior), no todo el historial.
    const [appts, paidPayments, schedule] = await Promise.all([
      this.appointments.find({
        where: { professionalId: tenantId, startAt: Between(from, until) },
        select: ['id', 'personId', 'startAt', 'endAt', 'status', 'serviceId', 'createdVia'],
      }),
      // Ingresos: solo pagos efectivamente cobrados (Paid), por fecha de cobro. Incluye
      // señas, MercadoPago y efectivo confirmado; el efectivo no cobrado/pagaré no suma.
      // Se excluye el IVA (pass-through para cubrir la comisión MP): ingreso = base.
      this.payments.find({
        where: {
          professionalId: tenantId,
          status: PaymentStatus.Paid,
          paidAt: Between(from, until),
        },
        select: ['amountCents', 'vatAmountCents', 'paidAt'],
      }),
      this.memberships
        .find({ where: { professionalId: tenantId, status: MembershipStatus.Active } })
        .then((ms) => this.loadSchedule(ms, previous.start, current.until)),
    ]);

    const serviceIds = [...new Set(appts.map((a) => a.serviceId).filter((x): x is string => !!x))];
    const services = serviceIds.length
      ? await this.services.find({ where: { id: In(serviceIds) }, withDeleted: true })
      : [];
    const serviceById = new Map(services.map((s) => [s.id, s]));

    // Primera atención de cada persona atendida (para separar nuevos de recurrentes).
    const attendedPersons = [
      ...new Set(appts.filter((a) => a.status === AppointmentStatus.Done).map((a) => a.personId)),
    ];
    const firstDone = await this.firstDoneByPerson(tenantId, attendedPersons);

    const inCurrent = within(appts, current);
    const totals = this.totalsFor(
      current,
      appts,
      paidPayments,
      serviceById,
      firstDone,
      schedule,
      tz,
    );
    const previousTotals = this.totalsFor(
      previous,
      appts,
      paidPayments,
      serviceById,
      firstDone,
      schedule,
      tz,
    );

    // Gráficos por día del período actual (hasta hoy, sin días futuros vacíos).
    const days = daysOf(current);
    const attendanceByDay = days.map((d) => {
      const slice = inCurrent.filter((a) => sameDay(a.startAt, d, tz));
      return {
        date: d.toISODate()!,
        label: dayLabel(d, range),
        atendidos: slice.filter((a) => a.status === AppointmentStatus.Done).length,
        cancelados: slice.filter((a) => a.status === AppointmentStatus.Cancelled).length,
        ausentes: slice.filter((a) => a.status === AppointmentStatus.NoShow).length,
      };
    });
    const incomeByDay = days.map((d) => ({
      date: d.toISODate()!,
      label: dayLabel(d, range),
      cents: paidPayments
        .filter((p) => p.paidAt && sameDay(p.paidAt, d, tz))
        .reduce((acc, p) => acc + (p.amountCents - p.vatAmountCents), 0),
    }));

    const attendedNow = inCurrent.filter((a) => a.status === AppointmentStatus.Done);
    const personsNow = new Set(attendedNow.map((a) => a.personId));
    const nuevos = [...personsNow].filter(
      (p) => (firstDone.get(p) ?? 0) >= current.start.toMillis(),
    ).length;

    const [pending, atRisk] = await Promise.all([
      this.pending(tenantId, now),
      this.atRiskClients(tenantId, now),
    ]);

    return {
      range,
      offset,
      period: periodDto(current),
      previousPeriod: periodDto(previous),
      totals,
      previousTotals,
      attendanceByDay,
      incomeByDay,
      peakHours: peakHours(inCurrent, tz),
      services: servicesRanking(attendedNow, serviceById),
      newVsReturning: { nuevos, recurrentes: personsNow.size - nuevos },
      pending,
      atRiskClients: atRisk.clients,
      atRiskTotal: atRisk.total,
    };
  }

  // ---- Métricas del equipo (vista del dueño del comercio) ----

  /**
   * Resumen por profesional de un comercio, solo con lo que pasó EN ese comercio. La actividad
   * (atendidos, ausencias, agenda ocupada) siempre se ve; la plata (cobrado, facturado, ticket)
   * solo de quien la comparte (`membership.shareIncomeWithComercio`) o si quien mira es el
   * propio profesional. Para el resto viaja `null`: el filtro se hace acá, no en el front.
   */
  async getComercioTeam(
    comercioId: string,
    viewerAccountId: string,
    range: MetricsRange,
    offset = 0,
  ): Promise<ComercioTeamMetricsDto> {
    const comercio = await this.comercios.findOne({ where: { id: comercioId } });
    const tz = comercio?.timezone || 'America/Argentina/Buenos_Aires';
    const now = DateTime.now().setZone(tz);
    const current = resolvePeriod(now, range, offset);
    const previous = previousPeriod(current, range);
    const from = previous.start.toJSDate();
    const until = current.until.toJSDate();

    const memberships = await this.memberships.find({
      where: { comercioId, status: MembershipStatus.Active },
      relations: { professional: true },
      order: { createdAt: 'ASC' },
    });

    const [appts, payRows, schedule] = await Promise.all([
      this.appointments.find({
        where: { comercioId, startAt: Between(from, until) },
        select: [
          'id',
          'personId',
          'membershipId',
          'startAt',
          'endAt',
          'status',
          'serviceId',
          'createdVia',
        ],
      }),
      // Cobros de turnos de ESTE comercio (un pago sin turno no se puede atribuir a un local).
      this.appointments.query<TeamPaymentRow[]>(
        `SELECT p.amount_cents, p.vat_amount_cents, p.paid_at, a.membership_id
           FROM payment p
           JOIN appointment a ON a.id = p.appointment_id AND a.deleted_at IS NULL
          WHERE a.comercio_id = $1 AND p.status = 'paid' AND p.deleted_at IS NULL
            AND p.paid_at BETWEEN $2 AND $3`,
        [comercioId, from, until],
      ),
      this.loadSchedule(memberships, previous.start, current.until),
    ]);

    const serviceIds = [...new Set(appts.map((a) => a.serviceId).filter((x): x is string => !!x))];
    const services = serviceIds.length
      ? await this.services.find({ where: { id: In(serviceIds) }, withDeleted: true })
      : [];
    const serviceById = new Map(services.map((s) => [s.id, s]));
    const noFirstVisits = new Map<string, number>();

    const members: TeamMemberMetricsDto[] = memberships.map((m) => {
      const mine = appts.filter((a) => a.membershipId === m.id);
      const pays = payRows
        .filter((r) => r.membership_id === m.id)
        .map(
          (r) =>
            ({
              amountCents: Number(r.amount_cents),
              vatAmountCents: Number(r.vat_amount_cents),
              paidAt: new Date(r.paid_at),
            }) as Payment,
        );
      const sched: ScheduleData = {
        ...schedule,
        memberships: schedule.memberships.filter((x) => x.id === m.id),
      };
      const cur = this.totalsFor(current, mine, pays, serviceById, noFirstVisits, sched, tz);
      const prev = this.totalsFor(previous, mine, pays, serviceById, noFirstVisits, sched, tz);
      const attendedNow = within(mine, current).filter((a) => a.status === AppointmentStatus.Done);
      const top = servicesRanking(attendedNow, serviceById).sort(
        (a, b) => b.attended - a.attended,
      )[0];
      const sharesIncome =
        m.shareIncomeWithComercio || m.professional?.accountId === viewerAccountId;
      return {
        membershipId: m.id,
        professionalName: m.professional?.businessName ?? 'Profesional',
        sharesIncome,
        attended: cur.attended,
        previousAttended: prev.attended,
        cancelled: cur.cancelled,
        noShow: cur.noShow,
        noShowRate: cur.noShowRate,
        previousNoShowRate: prev.noShowRate,
        occupancyRate: cur.occupancyRate,
        previousOccupancyRate: prev.occupancyRate,
        bookedMinutes: cur.bookedMinutes,
        availableMinutes: cur.availableMinutes,
        topServiceName: top?.name ?? null,
        incomeCents: sharesIncome ? cur.incomeCents : null,
        previousIncomeCents: sharesIncome ? prev.incomeCents : null,
        billedCents: sharesIncome ? cur.billedCents : null,
        averageTicketCents: sharesIncome ? cur.averageTicketCents : null,
      };
    });

    const sum = (f: (x: TeamMemberMetricsDto) => number) =>
      members.reduce((acc, x) => acc + f(x), 0);
    const attended = sum((x) => x.attended);
    const noShow = sum((x) => x.noShow);
    const booked = sum((x) => x.bookedMinutes);
    const available = sum((x) => x.availableMinutes);
    return {
      range,
      offset,
      period: periodDto(current),
      previousPeriod: periodDto(previous),
      team: {
        attended,
        previousAttended: sum((x) => x.previousAttended),
        noShow,
        noShowRate: attended + noShow ? round3(noShow / (attended + noShow)) : 0,
        occupancyRate: available > 0 ? round3(Math.min(1, booked / available)) : null,
        sharingCount: members.filter((x) => x.sharesIncome).length,
      },
      members,
    };
  }

  // ---- Totales de un período ----

  private totalsFor(
    period: Period,
    allAppts: Appointment[],
    allPayments: Payment[],
    serviceById: Map<string, Service>,
    firstDone: Map<string, number>,
    schedule: ScheduleData,
    tz: string,
  ): MetricsTotalsDto {
    const appts = within(allAppts, period);
    const attendedList = appts.filter((a) => a.status === AppointmentStatus.Done);
    const attended = attendedList.length;
    const cancelled = appts.filter((a) => a.status === AppointmentStatus.Cancelled).length;
    const noShow = appts.filter((a) => a.status === AppointmentStatus.NoShow).length;

    const start = period.start.toMillis();
    const end = period.until.toMillis();
    const incomeCents = allPayments
      .filter((p) => {
        const t = p.paidAt?.getTime() ?? 0;
        return t >= start && t <= end;
      })
      .reduce((acc, p) => acc + (p.amountCents - p.vatAmountCents), 0);

    const billedCents = attendedList.reduce(
      (acc, a) => acc + ((a.serviceId && serviceById.get(a.serviceId)?.priceCents) || 0),
      0,
    );

    const persons = new Set(attendedList.map((a) => a.personId));
    const newClients = [...persons].filter((p) => (firstDone.get(p) ?? 0) >= start).length;

    // Ocupación: minutos reservados (turnos con horario que no se cancelaron) sobre los
    // minutos de atención con turno según Horarios, descontando descansos, bloqueos y
    // feriados no trabajados. Los que llegan sin turno no ocupan agenda reservable.
    const bookedMinutes = Math.round(
      appts
        .filter(
          (a) => a.status !== AppointmentStatus.Cancelled && a.createdVia !== CreatedVia.WalkIn,
        )
        .reduce((acc, a) => acc + Math.max(0, a.endAt.getTime() - a.startAt.getTime()), 0) / 60000,
    );
    const availableMinutes = this.availableMinutes(period, schedule, tz);

    return {
      appointments: appts.length,
      attended,
      cancelled,
      noShow,
      noShowRate: attended + noShow ? round3(noShow / (attended + noShow)) : 0,
      incomeCents,
      billedCents,
      averageTicketCents: attended ? Math.round(billedCents / attended) : 0,
      newClients,
      returningClients: persons.size - newClients,
      occupancyRate:
        availableMinutes > 0 ? round3(Math.min(1, bookedMinutes / availableMinutes)) : null,
      bookedMinutes,
      availableMinutes,
      onlineBookings: appts.filter((a) => a.createdVia === CreatedVia.ClientSelf).length,
    };
  }

  // ---- Ocupación de agenda ----

  /** Horarios, bloqueos y feriados de las membresías dadas (las "solo por orden de llegada" no cuentan). */
  private async loadSchedule(
    allMemberships: Membership[],
    from: DateTime,
    until: DateTime,
  ): Promise<ScheduleData> {
    const memberships = allMemberships.filter((m) => !m.walkInOnly);
    if (!memberships.length) {
      return { memberships, rules: [], timeOffs: [], blockedHolidays: new Set() };
    }
    const ids = memberships.map((m) => m.id);
    const fromDate = from.toISODate()!;
    const toDate = until.toISODate()!;
    const [rules, timeOffs, holidays] = await Promise.all([
      this.rules.find({ where: { membershipId: In(ids) } }),
      this.timeOffs.find({
        where: {
          membershipId: In(ids),
          startAt: LessThanOrEqual(until.toJSDate()),
          endAt: MoreThanOrEqual(from.toJSDate()),
        },
      }),
      Promise.all(
        memberships.map(async (m) =>
          (await this.holidays.listBlockedForMembership(m, fromDate, toDate)).map(
            (h) => `${m.id}|${h.date}`,
          ),
        ),
      ),
    ]);
    return { memberships, rules, timeOffs, blockedHolidays: new Set(holidays.flat()) };
  }

  private availableMinutes(period: Period, schedule: ScheduleData, tz: string): number {
    let total = 0;
    for (const day of daysOf(period)) {
      const dow = day.weekday % 7; // Luxon: 1=lunes..7=domingo; reglas: 0=domingo.
      const dayEnd = day.plus({ days: 1 });
      // Si el período corta hoy, solo cuenta lo que ya pasó del día.
      const limit = Math.min(1440, Math.max(0, period.until.diff(day, 'minutes').minutes));
      for (const m of schedule.memberships) {
        if (schedule.blockedHolidays.has(`${m.id}|${day.toISODate()}`)) continue;
        const mine = schedule.rules.filter((r) => r.membershipId === m.id && r.dayOfWeek === dow);
        const work = mine
          .filter(
            (r) =>
              r.kind === ScheduleRuleKind.Work && r.attendanceMode === AttendanceMode.Appointment,
          )
          .map(ruleInterval);
        if (!work.length) continue;
        const cuts = mine.filter((r) => r.kind === ScheduleRuleKind.Break).map(ruleInterval);
        for (const off of schedule.timeOffs) {
          if (off.membershipId !== m.id) continue;
          const s = DateTime.max(DateTime.fromJSDate(off.startAt).setZone(tz), day);
          const e = DateTime.min(DateTime.fromJSDate(off.endAt).setZone(tz), dayEnd);
          if (e > s) cuts.push([s.diff(day, 'minutes').minutes, e.diff(day, 'minutes').minutes]);
        }
        total += length(clip(subtract(work, cuts), 0, limit));
      }
    }
    return Math.round(total);
  }

  // ---- Clientes ----

  /** Fecha (ms) de la primera atención terminada de cada persona, en toda la historia. */
  private async firstDoneByPerson(
    tenantId: string,
    personIds: string[],
  ): Promise<Map<string, number>> {
    if (!personIds.length) return new Map();
    const rows: { person_id: string; first_done: Date }[] = await this.appointments.query(
      `SELECT person_id, MIN(start_at) AS first_done
         FROM appointment
        WHERE professional_id = $1 AND status = 'done' AND deleted_at IS NULL
          AND person_id = ANY($2::uuid[])
        GROUP BY person_id`,
      [tenantId, personIds],
    );
    return new Map(rows.map((r) => [r.person_id, new Date(r.first_done).getTime()]));
  }

  /**
   * Clientes que dejaron de venir: su última atención fue hace más de AT_RISK_DAYS (y
   * menos de un año) y no tienen un turno próximo. Solo cuentan las atenciones
   * terminadas (un turno cancelado no es una visita) y se excluyen los archivados. Van
   * primero los que se fueron hace menos: son los más fáciles de recuperar.
   */
  private async atRiskClients(
    tenantId: string,
    now: DateTime,
  ): Promise<{ clients: AtRiskClientDto[]; total: number }> {
    const rows: {
      client_id: string;
      person_id: string;
      full_name: string;
      phone: string | null;
      last_visit: Date;
      visits: number;
      total: number;
    }[] = await this.appointments.query(
      `SELECT pc.id AS client_id, p.id AS person_id, p.full_name, p.phone,
              MAX(a.start_at) FILTER (WHERE a.status = 'done') AS last_visit,
              (COUNT(*) FILTER (WHERE a.status = 'done'))::int AS visits,
              (COUNT(*) OVER ())::int AS total
         FROM professional_client pc
         JOIN person p ON p.id = pc.person_id AND p.deleted_at IS NULL
         JOIN appointment a ON a.professional_id = pc.professional_id
                           AND a.person_id = pc.person_id AND a.deleted_at IS NULL
        WHERE pc.professional_id = $1 AND pc.status = 'active' AND pc.deleted_at IS NULL
        GROUP BY pc.id, p.id, p.full_name, p.phone
       HAVING MAX(a.start_at) FILTER (WHERE a.status = 'done') BETWEEN $2 AND $3
          AND NOT COALESCE(BOOL_OR(a.start_at > $4 AND a.status IN ('requested', 'confirmed')), false)
        ORDER BY last_visit DESC
        LIMIT $5`,
      [
        tenantId,
        now.minus({ days: LOST_AFTER_DAYS }).toJSDate(),
        now.minus({ days: AT_RISK_DAYS }).toJSDate(),
        now.toJSDate(),
        AT_RISK_LIMIT,
      ],
    );
    const clients = rows.map((r) => {
      const last = DateTime.fromJSDate(new Date(r.last_visit)).setZone(now.zone);
      return {
        clientId: r.client_id,
        personId: r.person_id,
        fullName: r.full_name,
        phone: r.phone,
        lastVisitLabel: last.setLocale('es').toRelative({ base: now }) ?? 'hace mucho',
        daysSinceLastVisit: Math.floor(now.diff(last, 'days').days),
        visits: Number(r.visits),
      };
    });
    return { clients, total: rows.length ? Number(rows[0].total) : 0 };
  }

  // ---- Pendientes a hoy ----

  private async pending(tenantId: string, now: DateTime) {
    const [unpaid, unclosedAppointments] = await Promise.all([
      this.payments.find({
        where: {
          professionalId: tenantId,
          method: In(OFF_SYSTEM_METHODS),
          status: In(UNPAID_CASH),
        },
        select: ['amountCents'],
      }),
      this.appointments.count({
        where: {
          professionalId: tenantId,
          status: In(OPEN_STATUSES),
          endAt: LessThan(now.toJSDate()),
        },
      }),
    ]);
    return {
      cashCents: unpaid.reduce((acc, p) => acc + p.amountCents, 0),
      cashCount: unpaid.length,
      unclosedAppointments,
    };
  }
}

// ---- Helpers ----

function within<T extends { startAt: Date }>(items: T[], period: Period): T[] {
  const start = period.start.toMillis();
  const end = period.until.toMillis();
  return items.filter((a) => {
    const t = a.startAt.getTime();
    return t >= start && t <= end;
  });
}

/** Días (00:00 en la TZ) desde el inicio del período hasta el día en que se corta. */
function daysOf(period: Period): DateTime[] {
  const out: DateTime[] = [];
  const last = period.until.startOf('day');
  for (let d = period.start.startOf('day'); d <= last; d = d.plus({ days: 1 })) out.push(d);
  return out;
}

function sameDay(date: Date, day: DateTime, tz: string): boolean {
  return DateTime.fromJSDate(date).setZone(tz).hasSame(day, 'day');
}

/** "Lun 9" en la semana; "9" en el mes (el detalle lo da la fecha). */
function dayLabel(day: DateTime, range: MetricsRange): string {
  return range === MetricsRange.Week ? `${WEEKDAY_ES[day.weekday]} ${day.day}` : String(day.day);
}

function periodDto(p: Period): MetricsPeriodDto {
  return {
    from: p.start.toISODate()!,
    to: p.end.toISODate()!,
    until: p.until.toISODate()!,
    isCurrent: p.isCurrent,
  };
}

/** Turnos por hora de inicio (sin cancelados), con las horas intermedias en cero. */
function peakHours(appts: Appointment[], tz: string): PeakHourDto[] {
  const counts = new Map<number, number>();
  for (const a of appts) {
    if (a.status === AppointmentStatus.Cancelled) continue;
    const h = DateTime.fromJSDate(a.startAt).setZone(tz).hour;
    counts.set(h, (counts.get(h) ?? 0) + 1);
  }
  if (!counts.size) return [];
  const hours = [...counts.keys()];
  const out: PeakHourDto[] = [];
  for (let h = Math.min(...hours); h <= Math.max(...hours); h++) {
    out.push({ hour: `${String(h).padStart(2, '0')}h`, turnos: counts.get(h) ?? 0 });
  }
  return out;
}

function servicesRanking(
  attended: Appointment[],
  serviceById: Map<string, Service>,
): ServiceMetricsDto[] {
  const byService = new Map<string, ServiceMetricsDto>();
  for (const a of attended) {
    const key = a.serviceId ?? '';
    const svc = a.serviceId ? serviceById.get(a.serviceId) : undefined;
    const row = byService.get(key) ?? {
      serviceId: a.serviceId,
      name: svc?.name ?? NO_SERVICE_LABEL,
      attended: 0,
      billedCents: 0,
    };
    row.attended += 1;
    row.billedCents += svc?.priceCents ?? 0;
    byService.set(key, row);
  }
  return [...byService.values()].sort(
    (a, b) => b.billedCents - a.billedCents || b.attended - a.attended,
  );
}

function ruleInterval(r: ScheduleRule): Interval {
  const toMin = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + (m || 0);
  };
  const s = toMin(r.startTime);
  const e = toMin(r.endTime);
  return [s, e <= s ? 1440 : e]; // "00:00" como fin = medianoche.
}

function union(xs: Interval[]): Interval[] {
  const sorted = [...xs].sort((a, b) => a[0] - b[0]);
  const out: Interval[] = [];
  for (const [s, e] of sorted) {
    const last = out[out.length - 1];
    if (last && s <= last[1]) last[1] = Math.max(last[1], e);
    else out.push([s, e]);
  }
  return out;
}

function subtract(base: Interval[], cuts: Interval[]): Interval[] {
  let out = union(base);
  for (const [cs, ce] of union(cuts)) {
    out = out.flatMap(([s, e]): Interval[] => {
      if (ce <= s || cs >= e) return [[s, e]];
      const parts: Interval[] = [];
      if (cs > s) parts.push([s, cs]);
      if (ce < e) parts.push([ce, e]);
      return parts;
    });
  }
  return out;
}

function clip(xs: Interval[], lo: number, hi: number): Interval[] {
  return xs.map(([s, e]): Interval => [Math.max(s, lo), Math.min(e, hi)]).filter(([s, e]) => e > s);
}

function length(xs: Interval[]): number {
  return xs.reduce((acc, [s, e]) => acc + (e - s), 0);
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
