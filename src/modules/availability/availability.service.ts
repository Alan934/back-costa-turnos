import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, In, Repository } from 'typeorm';
import { DateTime, Interval } from 'luxon';
import { AppointmentStatus, ScheduleRuleKind } from '@/common/enums';
import { ComerciosService } from '@/modules/comercios/comercios.service';
import { Professional } from '@/modules/professionals/entities/professional.entity';
import { Staff } from '@/modules/professionals/entities/staff.entity';
import { Service } from '@/modules/catalog/entities/service.entity';
import { Appointment } from '@/modules/appointments/entities/appointment.entity';
import { ScheduleRule } from './entities/schedule-rule.entity';
import { ScheduleRuleService } from './entities/schedule-rule-service.entity';
import { TimeOff } from './entities/time-off.entity';
import {
  AvailableSlot,
  CreateScheduleRuleDto,
  CreateTimeOffDto,
  UpdateScheduleRuleDto,
} from './dto/availability.dto';

// Estados de turno que ocupan un horario (no se pueden pisar).
const BLOCKING_STATUSES = [
  AppointmentStatus.Requested,
  AppointmentStatus.Confirmed,
  AppointmentStatus.InProgress,
  AppointmentStatus.Done,
];

@Injectable()
export class AvailabilityService {
  constructor(
    @InjectRepository(ScheduleRule)
    private readonly scheduleRules: Repository<ScheduleRule>,
    @InjectRepository(ScheduleRuleService)
    private readonly scheduleRuleServices: Repository<ScheduleRuleService>,
    @InjectRepository(TimeOff)
    private readonly timeOffs: Repository<TimeOff>,
    @InjectRepository(Staff)
    private readonly staff: Repository<Staff>,
    @InjectRepository(Service)
    private readonly services: Repository<Service>,
    @InjectRepository(Professional)
    private readonly professionals: Repository<Professional>,
    @InjectRepository(Appointment)
    private readonly appointments: Repository<Appointment>,
    private readonly comercios: ComerciosService,
  ) {}

  // ---- Helpers de mapeo regla<->servicio ----

  /** Mapa scheduleRuleId -> serviceIds para un conjunto de reglas. */
  private async serviceIdsByRule(ruleIds: string[]): Promise<Map<string, string[]>> {
    const map = new Map<string, string[]>();
    if (ruleIds.length === 0) return map;
    const rows = await this.scheduleRuleServices.find({
      where: { scheduleRuleId: In(ruleIds) },
    });
    for (const row of rows) {
      const list = map.get(row.scheduleRuleId) ?? [];
      list.push(row.serviceId);
      map.set(row.scheduleRuleId, list);
    }
    return map;
  }

  private async withServiceIds(rules: ScheduleRule[]): Promise<ScheduleRule[]> {
    const byRule = await this.serviceIdsByRule(rules.map((r) => r.id));
    return rules.map((r) =>
      Object.assign(r, { serviceIds: byRule.get(r.id) ?? [] }),
    );
  }

  // ---- Schedule rules POR MEMBRESÍA ----

  async listScheduleRulesByMembership(membershipId: string): Promise<ScheduleRule[]> {
    const rules = await this.scheduleRules.find({
      where: { membershipId },
      order: { dayOfWeek: 'ASC', startTime: 'ASC' },
    });
    return this.withServiceIds(rules);
  }

  async createScheduleRuleForMembership(
    membershipId: string,
    dto: CreateScheduleRuleDto,
  ): Promise<ScheduleRule> {
    if (dto.startTime >= dto.endTime) {
      throw new BadRequestException('start_time debe ser anterior a end_time');
    }
    const membership = await this.comercios.getMembershipById(membershipId);
    // staff_id legacy: el sillón del comercio-de-uno / del profesional.
    const staff = await this.staff.findOne({ where: { professionalId: membership.professionalId } });
    if (!staff) throw new NotFoundException('Staff del profesional no encontrado');

    const serviceIds = await this.validateRuleServices(membershipId, dto.serviceIds);

    const rule = await this.scheduleRules.save(
      this.scheduleRules.create({
        membershipId,
        staffId: staff.id,
        dayOfWeek: dto.dayOfWeek,
        startTime: dto.startTime,
        endTime: dto.endTime,
        kind: dto.kind ?? ScheduleRuleKind.Work,
      }),
    );
    await this.saveRuleServices(rule.id, serviceIds);
    return Object.assign(rule, { serviceIds });
  }

  /**
   * Edita una regla in-place. Solo cambia lo enviado. Si `serviceIds` viene, REEMPLAZA
   * el mapeo (vacío = todos); si se omite, lo deja como estaba. Devuelve la regla con
   * sus serviceIds actuales.
   */
  async updateScheduleRuleForMembership(
    membershipId: string,
    id: string,
    dto: UpdateScheduleRuleDto,
  ): Promise<ScheduleRule> {
    const rule = await this.scheduleRules.findOne({ where: { id, membershipId } });
    if (!rule) throw new NotFoundException('Regla no encontrada');

    const startTime = dto.startTime ?? rule.startTime;
    const endTime = dto.endTime ?? rule.endTime;
    if (startTime >= endTime) {
      throw new BadRequestException('start_time debe ser anterior a end_time');
    }

    if (dto.dayOfWeek !== undefined) rule.dayOfWeek = dto.dayOfWeek;
    rule.startTime = startTime;
    rule.endTime = endTime;
    if (dto.kind !== undefined) rule.kind = dto.kind;
    await this.scheduleRules.save(rule);

    // serviceIds presente => reemplaza el mapeo; omitido => no se toca.
    if (dto.serviceIds !== undefined) {
      const serviceIds = await this.validateRuleServices(membershipId, dto.serviceIds);
      await this.scheduleRuleServices.delete({ scheduleRuleId: id });
      await this.saveRuleServices(id, serviceIds);
      return Object.assign(rule, { serviceIds });
    }

    const byRule = await this.serviceIdsByRule([id]);
    return Object.assign(rule, { serviceIds: byRule.get(id) ?? [] });
  }

  async deleteScheduleRuleByMembership(membershipId: string, id: string): Promise<void> {
    const res = await this.scheduleRules.delete({ id, membershipId });
    if (!res.affected) throw new NotFoundException('Regla no encontrada');
  }

  /** Valida que los serviceIds pertenezcan a la membresía y devuelve la lista (o []). */
  private async validateRuleServices(
    membershipId: string,
    serviceIds?: string[],
  ): Promise<string[]> {
    if (!serviceIds || serviceIds.length === 0) return [];
    const unique = [...new Set(serviceIds)];
    const found = await this.services.find({
      where: { id: In(unique), membershipId },
    });
    if (found.length !== unique.length) {
      throw new BadRequestException('Algún servicio no pertenece a esta membresía');
    }
    return unique;
  }

  private async saveRuleServices(scheduleRuleId: string, serviceIds: string[]): Promise<void> {
    if (serviceIds.length === 0) return;
    await this.scheduleRuleServices.save(
      serviceIds.map((serviceId) =>
        this.scheduleRuleServices.create({ scheduleRuleId, serviceId }),
      ),
    );
  }

  // ---- Time off POR MEMBRESÍA ----

  async createTimeOffForMembership(membershipId: string, dto: CreateTimeOffDto): Promise<TimeOff> {
    const membership = await this.comercios.getMembershipById(membershipId);
    const staff = await this.staff.findOne({ where: { professionalId: membership.professionalId } });
    if (!staff) throw new NotFoundException('Staff del profesional no encontrado');
    const start = new Date(dto.startAt);
    const end = new Date(dto.endAt);
    if (start >= end) throw new BadRequestException('start_at debe ser anterior a end_at');
    return this.timeOffs.save(
      this.timeOffs.create({
        membershipId,
        staffId: staff.id,
        startAt: start,
        endAt: end,
        reason: dto.reason ?? null,
      }),
    );
  }

  listTimeOffByMembership(membershipId: string): Promise<TimeOff[]> {
    return this.timeOffs.find({ where: { membershipId }, order: { startAt: 'ASC' } });
  }

  async deleteTimeOffByMembership(membershipId: string, id: string): Promise<void> {
    const res = await this.timeOffs.delete({ id, membershipId });
    if (!res.affected) throw new NotFoundException('Bloqueo no encontrado');
  }

  /**
   * Slots libres de una membresía (profesional-en-comercio) para un servicio.
   * Respeta horarios work-break, time_off, turnos ocupados, zona horaria del
   * comercio y el mapeo regla<->servicio (reglas que apliquen al servicio o a todos).
   */
  async computeSlotsByMembership(
    membershipId: string,
    serviceId: string,
    from: string,
    to: string,
  ): Promise<AvailableSlot[]> {
    const membership = await this.comercios.getMembershipById(membershipId);
    const comercio = await this.comercios.getComercio(membership.comercioId);

    const service = await this.services.findOne({ where: { id: serviceId, membershipId } });
    if (!service) throw new NotFoundException('Servicio no encontrado');

    const zone = comercio.timezone;
    const duration = service.durationMinutes;
    const rangeStart = DateTime.fromISO(from, { zone }).startOf('day');
    const rangeEnd = DateTime.fromISO(to, { zone }).endOf('day');
    if (!rangeStart.isValid || !rangeEnd.isValid || rangeStart > rangeEnd) {
      throw new BadRequestException('Rango de fechas invalido');
    }

    const rules = await this.scheduleRules.find({ where: { membershipId } });
    // Reglas de trabajo que aplican a este servicio (mapeo vacío = todas).
    const ruleServiceMap = await this.serviceIdsByRule(
      rules.filter((r) => r.kind === ScheduleRuleKind.Work).map((r) => r.id),
    );

    const workByDay = new Map<number, ScheduleRule[]>();
    const breaksByDay = new Map<number, ScheduleRule[]>();
    for (const rule of rules) {
      if (rule.kind === ScheduleRuleKind.Work) {
        const mapped = ruleServiceMap.get(rule.id);
        // Si la regla está mapeada a servicios específicos y este no está, se ignora.
        if (mapped && mapped.length > 0 && !mapped.includes(serviceId)) continue;
        const list = workByDay.get(rule.dayOfWeek) ?? [];
        list.push(rule);
        workByDay.set(rule.dayOfWeek, list);
      } else {
        const list = breaksByDay.get(rule.dayOfWeek) ?? [];
        list.push(rule);
        breaksByDay.set(rule.dayOfWeek, list);
      }
    }

    const utcStart = rangeStart.toUTC().toJSDate();
    const utcEnd = rangeEnd.toUTC().toJSDate();

    const timeOffs = await this.timeOffs.find({ where: { membershipId } });
    const busy = await this.appointments.find({
      where: {
        membershipId,
        status: In(BLOCKING_STATUSES),
        startAt: Between(utcStart, utcEnd),
      },
    });

    return this.buildSlots({
      rangeStart,
      rangeEnd,
      duration,
      workByDay,
      breaksByDay,
      timeOffs,
      busy,
    });
  }

  // ---- Núcleo de cálculo de slots (compartido) ----
  private buildSlots(args: {
    rangeStart: DateTime;
    rangeEnd: DateTime;
    duration: number;
    workByDay: Map<number, ScheduleRule[]>;
    breaksByDay: Map<number, ScheduleRule[]>;
    timeOffs: TimeOff[];
    busy: Appointment[];
  }): AvailableSlot[] {
    const { rangeStart, rangeEnd, duration, workByDay, breaksByDay, timeOffs, busy } = args;
    const occupied: Interval[] = [
      ...timeOffs.map((t) =>
        Interval.fromDateTimes(DateTime.fromJSDate(t.startAt), DateTime.fromJSDate(t.endAt)),
      ),
      ...busy.map((a) =>
        Interval.fromDateTimes(DateTime.fromJSDate(a.startAt), DateTime.fromJSDate(a.endAt)),
      ),
    ];

    const now = DateTime.now();
    const slots: AvailableSlot[] = [];

    for (let day = rangeStart; day <= rangeEnd; day = day.plus({ days: 1 }).startOf('day')) {
      const dow = day.weekday % 7; // luxon: 1=lunes..7=domingo -> 0=domingo..6=sabado
      const workRules = workByDay.get(dow) ?? [];
      const dayBreaks = breaksByDay.get(dow) ?? [];

      for (const rule of workRules) {
        const [sh, sm] = rule.startTime.split(':').map(Number);
        const [eh, em] = rule.endTime.split(':').map(Number);
        const workStart = day.set({ hour: sh, minute: sm, second: 0, millisecond: 0 });
        const workEnd = day.set({ hour: eh, minute: em, second: 0, millisecond: 0 });

        let cursor = workStart;
        while (cursor.plus({ minutes: duration }) <= workEnd) {
          const slotStart = cursor;
          const slotEnd = cursor.plus({ minutes: duration });
          const slotInterval = Interval.fromDateTimes(slotStart, slotEnd);

          const overlapsBreak = dayBreaks.some((b) => {
            const [bsh, bsm] = b.startTime.split(':').map(Number);
            const [beh, bem] = b.endTime.split(':').map(Number);
            const bInterval = Interval.fromDateTimes(
              day.set({ hour: bsh, minute: bsm }),
              day.set({ hour: beh, minute: bem }),
            );
            return slotInterval.overlaps(bInterval);
          });

          const overlapsOccupied = occupied.some((o) => slotInterval.overlaps(o));
          const isPast = slotStart < now;

          if (!overlapsBreak && !overlapsOccupied && !isPast) {
            slots.push({
              startAt: slotStart.toUTC().toISO()!,
              endAt: slotEnd.toUTC().toISO()!,
            });
          }
          cursor = cursor.plus({ minutes: duration });
        }
      }
    }

    return slots;
  }

  // ---- Compat por professional + staff (comercio-de-uno) ----

  private async assertStaffInTenant(tenantId: string, staffId: string): Promise<Staff> {
    const staff = await this.staff.findOne({
      where: { id: staffId, professionalId: tenantId },
    });
    if (!staff) throw new NotFoundException('Staff no encontrado');
    return staff;
  }

  private personalMembershipId(professionalId: string): Promise<string> {
    return this.comercios.getPersonalMembership(professionalId).then((m) => m.id);
  }

  async listScheduleRules(tenantId: string, staffId: string): Promise<ScheduleRule[]> {
    await this.assertStaffInTenant(tenantId, staffId);
    return this.listScheduleRulesByMembership(await this.personalMembershipId(tenantId));
  }

  async createScheduleRule(
    tenantId: string,
    staffId: string,
    dto: CreateScheduleRuleDto,
  ): Promise<ScheduleRule> {
    await this.assertStaffInTenant(tenantId, staffId);
    return this.createScheduleRuleForMembership(await this.personalMembershipId(tenantId), dto);
  }

  async deleteScheduleRule(tenantId: string, staffId: string, id: string): Promise<void> {
    await this.assertStaffInTenant(tenantId, staffId);
    return this.deleteScheduleRuleByMembership(await this.personalMembershipId(tenantId), id);
  }

  async createTimeOff(tenantId: string, staffId: string, dto: CreateTimeOffDto): Promise<TimeOff> {
    await this.assertStaffInTenant(tenantId, staffId);
    return this.createTimeOffForMembership(await this.personalMembershipId(tenantId), dto);
  }

  async listTimeOff(tenantId: string, staffId: string): Promise<TimeOff[]> {
    await this.assertStaffInTenant(tenantId, staffId);
    return this.listTimeOffByMembership(await this.personalMembershipId(tenantId));
  }

  async deleteTimeOff(tenantId: string, staffId: string, id: string): Promise<void> {
    await this.assertStaffInTenant(tenantId, staffId);
    return this.deleteTimeOffByMembership(await this.personalMembershipId(tenantId), id);
  }

  async computeSlots(
    tenantId: string,
    staffId: string,
    serviceId: string,
    from: string,
    to: string,
  ): Promise<AvailableSlot[]> {
    await this.assertStaffInTenant(tenantId, staffId);
    return this.computeSlotsByMembership(
      await this.personalMembershipId(tenantId),
      serviceId,
      from,
      to,
    );
  }
}
