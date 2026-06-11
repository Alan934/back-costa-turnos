import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AppointmentStatus, CancellationReason } from '@/common/enums';
import { Appointment } from '@/modules/appointments/entities/appointment.entity';
import { Service } from '@/modules/catalog/entities/service.entity';
import { Staff } from '@/modules/professionals/entities/staff.entity';
import { Professional } from '@/modules/professionals/entities/professional.entity';
import { Person } from '@/modules/identity/entities/person.entity';
import { MyAppointmentDto } from './dto/my-appointment.dto';

const TERMINAL = [AppointmentStatus.Done, AppointmentStatus.Cancelled, AppointmentStatus.NoShow];

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
  ) {}

  /** Todos los turnos del cliente autenticado, en todos los negocios (cross-tenant). */
  async listMyAppointments(accountId: string): Promise<MyAppointmentDto[]> {
    const person = await this.persons.findOne({ where: { accountId } });
    if (!person) return [];

    const appts = await this.appointments.find({
      where: { personId: person.id },
      order: { startAt: 'ASC' },
    });
    if (appts.length === 0) return [];

    const maps = await this.loadRefs(appts);
    return appts.map((a) => this.toDto(a, maps));
  }

  /** Cancela un turno propio si esta dentro de la ventana de cancelacion. */
  async cancelMyAppointment(accountId: string, appointmentId: string): Promise<MyAppointmentDto> {
    const person = await this.persons.findOne({ where: { accountId } });
    if (!person) throw new NotFoundException('Cliente no encontrado');

    const appt = await this.appointments.findOne({
      where: { id: appointmentId, personId: person.id },
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
      serviceName: service?.name ?? 'Servicio',
      priceCents: service?.priceCents ?? 0,
      staffName: staff?.displayName ?? '',
      business: {
        name: professional?.businessName ?? '',
        slug: professional?.slug ?? '',
        address: professional?.address ?? null,
        cancellationWindowHours: professional?.cancellationWindowHours ?? 0,
      },
    };
  }
}
