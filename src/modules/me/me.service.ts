import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  AppointmentStatus,
  CancellationReason,
  NotificationChannel,
  NotificationType,
} from '@/common/enums';
import { NotificationsService } from '@/modules/notifications/notifications.service';
import { Appointment } from '@/modules/appointments/entities/appointment.entity';
import { Service } from '@/modules/catalog/entities/service.entity';
import { Staff } from '@/modules/professionals/entities/staff.entity';
import { Professional } from '@/modules/professionals/entities/professional.entity';
import { Person } from '@/modules/identity/entities/person.entity';
import { Membership } from '@/modules/comercios/entities/membership.entity';
import { MyAppointmentDto, RescheduleMyAppointmentDto } from './dto/my-appointment.dto';

const TERMINAL = [AppointmentStatus.Done, AppointmentStatus.Cancelled, AppointmentStatus.NoShow];
/** Estados que ocupan un horario en la agenda del profesional (para el chequeo de solape). */
const ACTIVE_STATUSES = [
  AppointmentStatus.Requested,
  AppointmentStatus.Confirmed,
  AppointmentStatus.InProgress,
];

@Injectable()
export class MeService {
  constructor(
    @InjectRepository(Appointment)
    private readonly appointments: Repository<Appointment>,
    @InjectRepository(Service)
    private readonly services: Repository<Service>,
    @InjectRepository(Staff)
    private readonly staff: Repository<Staff>,
    @InjectRepository(Professional)
    private readonly professionals: Repository<Professional>,
    @InjectRepository(Person)
    private readonly persons: Repository<Person>,
    @InjectRepository(Membership)
    private readonly memberships: Repository<Membership>,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Ids de TODAS las `Person` vinculadas a la cuenta. Normalmente es una sola
   * (identidad global por cuenta), pero el vínculo account↔person no tiene un
   * único garantizado a nivel DB: datos legados o el reclamo de identidades
   * sueltas por email/phone pueden dejar más de una. Unir por todas evita que los
   * turnos de un comercio "desaparezcan" si la cuenta quedó con varias identidades.
   */
  private async accountPersonIds(accountId: string): Promise<string[]> {
    const persons = await this.persons.find({
      where: { accountId },
      select: { id: true },
    });
    return persons.map((p) => p.id);
  }

  /** Todos los turnos del cliente autenticado, en todos los negocios (cross-tenant). */
  async listMyAppointments(accountId: string): Promise<MyAppointmentDto[]> {
    const personIds = await this.accountPersonIds(accountId);
    if (personIds.length === 0) return [];

    const appts = await this.appointments.find({
      where: { personId: In(personIds) },
      order: { startAt: 'ASC' },
    });
    if (appts.length === 0) return [];

    const maps = await this.loadRefs(appts);
    return appts.map((a) => this.toDto(a, maps));
  }

  /** Cancela un turno propio si esta dentro de la ventana de cancelacion. */
  async cancelMyAppointment(accountId: string, appointmentId: string): Promise<MyAppointmentDto> {
    const personIds = await this.accountPersonIds(accountId);
    if (personIds.length === 0) throw new NotFoundException('Cliente no encontrado');

    const appt = await this.appointments.findOne({
      where: { id: appointmentId, personId: In(personIds) },
    });
    if (!appt) throw new NotFoundException('Turno no encontrado');
    if (TERMINAL.includes(appt.status)) {
      throw new BadRequestException('El turno no se puede cancelar en su estado actual');
    }

    const professional = await this.professionals.findOne({ where: { id: appt.professionalId } });
    const windowHours = professional?.cancellationWindowHours ?? 0;
    const deadline = appt.startAt.getTime() - windowHours * 3_600_000;
    if (Date.now() > deadline) {
      throw new ConflictException(
        `Solo se puede cancelar hasta ${windowHours}h antes del turno. Contactá al negocio.`,
      );
    }

    appt.status = AppointmentStatus.Cancelled;
    appt.cancellationReason = CancellationReason.Client;
    await this.appointments.save(appt);

    const maps = await this.loadRefs([appt]);
    return this.toDto(appt, maps);
  }

  /** Reprograma un turno propio a un nuevo horario si esta dentro de la ventana de reprogramacion. */
  async rescheduleMyAppointment(
    accountId: string,
    appointmentId: string,
    dto: RescheduleMyAppointmentDto,
  ): Promise<MyAppointmentDto> {
    const personIds = await this.accountPersonIds(accountId);
    if (personIds.length === 0) throw new NotFoundException('Cliente no encontrado');

    const appt = await this.appointments.findOne({
      where: { id: appointmentId, personId: In(personIds) },
    });
    if (!appt) throw new NotFoundException('Turno no encontrado');
    if (TERMINAL.includes(appt.status)) {
      throw new BadRequestException('El turno no se puede reprogramar en su estado actual');
    }

    const professional = await this.professionals.findOne({ where: { id: appt.professionalId } });
    const windowHours = professional?.rescheduleWindowHours ?? 0;
    const deadline = appt.startAt.getTime() - windowHours * 3_600_000;
    if (Date.now() > deadline) {
      throw new ConflictException(
        `Solo se puede reprogramar hasta ${windowHours}h antes del turno. Contactá al negocio.`,
      );
    }

    const service = await this.services.findOne({ where: { id: appt.serviceId } });
    if (!service) throw new NotFoundException('Servicio no encontrado');

    const newStart = new Date(dto.startAt);
    const newEnd = new Date(newStart.getTime() + service.durationMinutes * 60_000);

    // Anticipación mínima del comercio: el nuevo horario respeta el mismo lead time que una reserva.
    const membership = await this.memberships.findOne({ where: { id: appt.membershipId } });
    const minBookingHours = membership?.minBookingHours ?? 0;
    const earliest = Date.now() + minBookingHours * 3_600_000;
    if (newStart.getTime() < earliest) {
      throw new BadRequestException(
        minBookingHours > 0
          ? `El turno debe reprogramarse con al menos ${minBookingHours}h de anticipación`
          : 'No se puede reprogramar a un horario en el pasado',
      );
    }

    // Ventana máxima del comercio: el nuevo horario no puede excederla. 0 = sin límite.
    const maxBookingDays = membership?.maxBookingDays ?? 0;
    if (maxBookingDays > 0) {
      const latest = Date.now() + maxBookingDays * 24 * 3_600_000;
      if (newStart.getTime() > latest) {
        throw new BadRequestException(
          `El turno no puede reprogramarse con más de ${maxBookingDays} días de anticipación`,
        );
      }
    }

    // Solape en la agenda del profesional (excluye el propio turno que se está moviendo).
    const conflicts = await this.appointments
      .createQueryBuilder('a')
      .where('a.professional_id = :professionalId', { professionalId: appt.professionalId })
      .andWhere('a.id != :id', { id: appt.id })
      .andWhere('a.status IN (:...statuses)', { statuses: ACTIVE_STATUSES })
      .andWhere('a.start_at < :end AND a.end_at > :start', { start: newStart, end: newEnd })
      .getCount();
    if (conflicts > 0) {
      throw new ConflictException('El nuevo horario se solapa con otro turno');
    }

    const oldStartAt = appt.startAt.toISOString();
    appt.startAt = newStart;
    appt.endAt = newEnd;
    await this.appointments.save(appt);

    // Avisa al profesional por correo que el cliente movió el turno.
    const owner = await this.persons.findOne({ where: { id: appt.personId } });
    await this.notifications.enqueue({
      professionalId: appt.professionalId,
      channel: NotificationChannel.Email,
      type: NotificationType.Rescheduled,
      payload: {
        appointmentId: appt.id,
        clientName: owner?.fullName ?? '',
        oldStartAt,
        newStartAt: appt.startAt.toISOString(),
      },
    });

    const maps = await this.loadRefs([appt]);
    return this.toDto(appt, maps);
  }

  private async loadRefs(appts: Appointment[]): Promise<{
    services: Map<string, Service>;
    staff: Map<string, Staff>;
    professionals: Map<string, Professional>;
  }> {
    const serviceIds = [...new Set(appts.map((a) => a.serviceId))];
    const staffIds = [...new Set(appts.map((a) => a.staffId))];
    const professionalIds = [...new Set(appts.map((a) => a.professionalId))];

    const [services, staff, professionals] = await Promise.all([
      serviceIds.length ? this.services.find({ where: { id: In(serviceIds) } }) : [],
      staffIds.length ? this.staff.find({ where: { id: In(staffIds) } }) : [],
      professionalIds.length ? this.professionals.find({ where: { id: In(professionalIds) } }) : [],
    ]);

    return {
      services: new Map(services.map((s) => [s.id, s])),
      staff: new Map(staff.map((s) => [s.id, s])),
      professionals: new Map(professionals.map((p) => [p.id, p])),
    };
  }

  private toDto(
    a: Appointment,
    maps: {
      services: Map<string, Service>;
      staff: Map<string, Staff>;
      professionals: Map<string, Professional>;
    },
  ): MyAppointmentDto {
    const service = maps.services.get(a.serviceId);
    const staff = maps.staff.get(a.staffId);
    const professional = maps.professionals.get(a.professionalId);

    return {
      id: a.id,
      startAt: a.startAt.toISOString(),
      endAt: a.endAt.toISOString(),
      status: a.status,
      isProvisional: a.isProvisional,
      serviceId: a.serviceId,
      membershipId: a.membershipId,
      professionalId: a.professionalId,
      serviceName: service?.name ?? 'Servicio',
      priceCents: service?.priceCents ?? 0,
      staffName: staff?.displayName ?? '',
      business: {
        name: professional?.businessName ?? '',
        slug: professional?.slug ?? '',
        address: professional?.address ?? null,
        cancellationWindowHours: professional?.cancellationWindowHours ?? 0,
        rescheduleWindowHours: professional?.rescheduleWindowHours ?? 0,
      },
    };
  }
}
