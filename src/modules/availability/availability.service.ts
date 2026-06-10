import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, In, Repository } from 'typeorm';
import { DateTime, Interval } from 'luxon';
import { AppointmentStatus, ScheduleRuleKind } from '@/common/enums';
import { Professional } from '@/modules/professionals/entities/professional.entity';
import { Staff } from '@/modules/professionals/entities/staff.entity';
import { Service } from '@/modules/catalog/entities/service.entity';
import { Appointment } from '@/modules/appointments/entities/appointment.entity';
import { ScheduleRule } from './entities/schedule-rule.entity';
import { TimeOff } from './entities/time-off.entity';
import { AvailableSlot, CreateScheduleRuleDto, CreateTimeOffDto } from './dto/availability.dto';

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
  ) {}

  private async assertStaffInTenant(tenantId: string, staffId: string): Promise<Staff> {
    const staff = await this.staff.findOne({
      where: { id: staffId, professionalId: tenantId },
    });
    if (!staff) throw new NotFoundException('Staff no encontrado');
    return staff;
  }

  // ---- Schedule rules ----
  listScheduleRules(tenantId: string, staffId: string): Promise<ScheduleRule[]> {
    return this.assertStaffInTenant(tenantId, staffId).then(() =>
      this.scheduleRules.find({
        where: { staffId },
        order: { dayOfWeek: 'ASC', startTime: 'ASC' },
      }),
    );
  }

  async createScheduleRule(
    tenantId: string,
    staffId: string,
    dto: CreateScheduleRuleDto,
  ): Promise<ScheduleRule> {
    await this.assertStaffInTenant(tenantId, staffId);
    if (dto.startTime >= dto.endTime) {
      throw new BadRequestException('start_time debe ser anterior a end_time');
    }
    const rule = this.scheduleRules.create({
      staffId,
      dayOfWeek: dto.dayOfWeek,
      startTime: dto.startTime,
      endTime: dto.endTime,
      kind: dto.kind ?? ScheduleRuleKind.Work,
    });
    return this.scheduleRules.save(rule);
  }

  async deleteScheduleRule(tenantId: string, staffId: string, id: string): Promise<void> {
    await this.assertStaffInTenant(tenantId, staffId);
    const res = await this.scheduleRules.delete({ id, staffId });
    if (!res.affected) throw new NotFoundException('Regla no encontrada');
  }

  // ---- Time off ----
  async createTimeOff(tenantId: string, staffId: string, dto: CreateTimeOffDto): Promise<TimeOff> {
    await this.assertStaffInTenant(tenantId, staffId);
    const start = new Date(dto.startAt);
    const end = new Date(dto.endAt);
    if (start >= end) throw new BadRequestException('start_at debe ser anterior a end_at');
    const timeOff = this.timeOffs.create({
      staffId,
      startAt: start,
      endAt: end,
      reason: dto.reason ?? null,
    });
    return this.timeOffs.save(timeOff);
  }

  listTimeOff(tenantId: string, staffId: string): Promise<TimeOff[]> {
    return this.assertStaffInTenant(tenantId, staffId).then(() =>
      this.timeOffs.find({ where: { staffId }, order: { startAt: 'ASC' } }),
    );
  }

  async deleteTimeOff(tenantId: string, staffId: string, id: string): Promise<void> {
    await this.assertStaffInTenant(tenantId, staffId);
    const res = await this.timeOffs.delete({ id, staffId });
    if (!res.affected) throw new NotFoundException('Bloqueo no encontrado');
  }

  /**
   * Calcula los slots libres de un staff para un servicio en un rango de fechas,
   * respetando: horarios work - break, time_off, turnos ocupados, y la zona
   * horaria del professional. Devuelve los inicios disponibles (en UTC ISO).
   */
  async computeSlots(
    tenantId: string,
    staffId: string,
    serviceId: string,
    from: string,
    to: string,
  ): Promise<AvailableSlot[]> {
    await this.assertStaffInTenant(tenantId, staffId);
    const professional = await this.professionals.findOneOrFail({
      where: { id: tenantId },
    });
    const service = await this.services.findOne({
      where: { id: serviceId, professionalId: tenantId },
    });
    if (!service) throw new NotFoundException('Servicio no encontrado');

    const zone = professional.timezone;
    const duration = service.durationMinutes;
    const rangeStart = DateTime.fromISO(from, { zone }).startOf('day');
    const rangeEnd = DateTime.fromISO(to, { zone }).endOf('day');
    if (!rangeStart.isValid || !rangeEnd.isValid || rangeStart > rangeEnd) {
      throw new BadRequestException('Rango de fechas invalido');
    }

    const rules = await this.scheduleRules.find({ where: { staffId } });
    const workByDay = new Map<number, ScheduleRule[]>();
    const breaksByDay = new Map<number, ScheduleRule[]>();
    for (const rule of rules) {
      const map = rule.kind === ScheduleRuleKind.Work ? workByDay : breaksByDay;
      const list = map.get(rule.dayOfWeek) ?? [];
      list.push(rule);
      map.set(rule.dayOfWeek, list);
    }

    const utcStart = rangeStart.toUTC().toJSDate();
    const utcEnd = rangeEnd.toUTC().toJSDate();

    const timeOffs = await this.timeOffs.find({ where: { staffId } });
    const busy = await this.appointments.find({
      where: {
        staffId,
        status: In(BLOCKING_STATUSES),
        startAt: Between(utcStart, utcEnd),
      },
    });

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
              startAt: slotStart.toUTC().toISO(),
              endAt: slotEnd.toUTC().toISO(),
            });
          }
          cursor = cursor.plus({ minutes: duration });
        }
      }
    }

    return slots;
  }
}
