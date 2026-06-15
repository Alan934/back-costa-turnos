import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, EntityManager, In, Repository } from 'typeorm';
import {
  AppointmentStatus,
  CancellationReason,
  CreatedVia,
  NotificationChannel,
  NotificationType,
  PaymentMethod,
  PaymentOption,
  PaymentStatus,
  PaymentType,
} from '@/common/enums';
import { TenantContextService } from '@/common/context/tenant-context.service';
import { PersonsService } from '@/modules/identity/persons.service';
import { ComerciosService } from '@/modules/comercios/comercios.service';
import { Service } from '@/modules/catalog/entities/service.entity';
import { Staff } from '@/modules/professionals/entities/staff.entity';
import { Payment } from '@/modules/payments/entities/payment.entity';
import { NotificationsService } from '@/modules/notifications/notifications.service';
import { Appointment } from './entities/appointment.entity';
import { BookAppointmentDto, BookWithDepositDto, ClientRefDto } from './dto/appointment.dto';
import { QueueUpdatePayload, WaitingRoomGateway } from './waiting-room.gateway';

// Estados que ocupan un horario.
const ACTIVE_STATUSES = [
  AppointmentStatus.Requested,
  AppointmentStatus.Confirmed,
  AppointmentStatus.InProgress,
];

@Injectable()
export class AppointmentsService {
  constructor(
    @InjectRepository(Appointment)
    private readonly appointments: Repository<Appointment>,
    @InjectRepository(Service)
    private readonly services: Repository<Service>,
    @InjectRepository(Payment)
    private readonly payments: Repository<Payment>,
    @InjectRepository(Staff)
    private readonly staff: Repository<Staff>,
    private readonly persons: PersonsService,
    private readonly tenantContext: TenantContextService,
    private readonly notifications: NotificationsService,
    private readonly waitingRoom: WaitingRoomGateway,
    private readonly comercios: ComerciosService,
  ) {}

  /**
   * Resuelve professionalId + staffId a partir de una membresía (para reservas
   * públicas en un comercio, donde el cliente elige al profesional, no el staff).
   */
  private async resolveMembershipBookingTarget(
    membershipId: string,
  ): Promise<{ professionalId: string; staffId: string }> {
    const membership = await this.comercios.getMembershipById(membershipId);
    const staff = await this.staff.findOne({
      where: { professionalId: membership.professionalId },
    });
    if (!staff) throw new NotFoundException('El profesional no tiene agenda configurada');
    return { professionalId: membership.professionalId, staffId: staff.id };
  }

  /** Reserva pública (sin pago) en un comercio, eligiendo al profesional por membresía. */
  async bookForMembership(
    membershipId: string,
    dto: { serviceId: string; startAt: string } & ClientRefDto,
    createdVia: CreatedVia,
  ): Promise<Appointment> {
    const { professionalId, staffId } = await this.resolveMembershipBookingTarget(membershipId);
    return this.book(professionalId, { ...dto, staffId }, createdVia);
  }

  /** Reserva pública con seña/pago completo en un comercio, eligiendo al profesional. */
  async bookWithDepositForMembership(
    membershipId: string,
    dto: { serviceId: string; startAt: string; method: PaymentMethod; paymentOption?: PaymentOption } & ClientRefDto,
  ): Promise<{ appointment: Appointment; payment: Payment }> {
    const { professionalId, staffId } = await this.resolveMembershipBookingTarget(membershipId);
    return this.bookWithDeposit(professionalId, { ...dto, staffId });
  }

  /** comercio_id/membership_id donde ocurre el turno (a partir del servicio). */
  private async resolveComercioContext(
    service: Service,
  ): Promise<{ comercioId: string; membershipId: string; minBookingHours: number }> {
    const membership = await this.comercios.getMembershipById(service.membershipId);
    return {
      comercioId: membership.comercioId,
      membershipId: membership.id,
      minBookingHours: membership.minBookingHours,
    };
  }

  /**
   * Anticipación mínima: el turno debe empezar al menos `minBookingHours` horas
   * después de "ahora". 0 = solo se valida que no sea en el pasado.
   */
  private assertLeadTime(startAt: Date, minBookingHours: number): void {
    const earliest = Date.now() + minBookingHours * 60 * 60_000;
    if (startAt.getTime() < earliest) {
      throw new BadRequestException(
        minBookingHours > 0
          ? `El turno debe reservarse con al menos ${minBookingHours} h de anticipación`
          : 'No se puede reservar un turno en el pasado',
      );
    }
  }

  private async resolvePersonId(ref: ClientRefDto): Promise<string> {
    if (ref.personId) {
      const person = await this.persons.findById(ref.personId);
      if (!person) throw new NotFoundException('Persona no encontrada');
      return person.id;
    }
    if (!ref.fullName) {
      throw new BadRequestException('Falta personId o datos del cliente (fullName)');
    }
    const person = await this.persons.findOrCreate({
      fullName: ref.fullName,
      email: ref.email ?? null,
      phone: ref.phone ?? null,
    });
    return person.id;
  }

  private async loadService(tenantId: string, serviceId: string): Promise<Service> {
    const service = await this.services.findOne({
      where: { id: serviceId, professionalId: tenantId, isActive: true },
    });
    if (!service) throw new NotFoundException('Servicio no encontrado o inactivo');
    return service;
  }

  /**
   * Turnos del PROFESIONAL que se solapan con [start,end) (estados activos). El
   * conflicto es por profesional, no por staff/comercio: un profesional no puede
   * estar en dos lugares a la vez (su agenda es única en todos sus comercios).
   */
  private overlapping(
    manager: EntityManager | Repository<Appointment>,
    professionalId: string,
    start: Date,
    end: Date,
  ): Promise<Appointment[]> {
    const repo = manager instanceof Repository ? manager : manager.getRepository(Appointment);
    // Solape: start < existing.end AND end > existing.start
    return repo
      .createQueryBuilder('a')
      .where('a.professional_id = :professionalId', { professionalId })
      .andWhere('a.status IN (:...statuses)', { statuses: ACTIVE_STATUSES })
      .andWhere('a.start_at < :end AND a.end_at > :start', { start, end })
      .getMany();
  }

  /**
   * Reserva un turno SIN pagar.
   * - Si el servicio NO permite "sin pago" -> rechaza (hay que pagar seña o total).
   * - Si además hay una opción paga habilitada -> queda provisional (desplazable
   *   por alguien que pague). Si solo permite "sin pago" -> confirmado firme.
   */
  async book(
    tenantId: string,
    dto: BookAppointmentDto,
    createdVia: CreatedVia,
  ): Promise<Appointment> {
    const service = await this.loadService(tenantId, dto.serviceId);
    if (!service.allowNoPayment) {
      throw new BadRequestException(
        'Este servicio requiere pago (seña o total) para reservar el turno',
      );
    }
    const startAt = new Date(dto.startAt);
    const endAt = new Date(startAt.getTime() + service.durationMinutes * 60_000);
    const { comercioId, membershipId, minBookingHours } =
      await this.resolveComercioContext(service);
    this.assertLeadTime(startAt, minBookingHours);
    const personId = await this.resolvePersonId(dto);

    const conflicts = await this.overlapping(this.appointments, tenantId, startAt, endAt);
    // Cualquier turno activo (incluido un provisional) bloquea una reserva casual.
    if (conflicts.length > 0) {
      throw new ConflictException(
        'El horario ya no esta disponible. Si hay una reserva provisional, podes tomarlo pagando.',
      );
    }

    // Provisional (desplazable) solo si el servicio también admite pago.
    const hasPaidOption = service.allowDeposit || service.allowFullPayment;
    const appointment = this.appointments.create({
      professionalId: tenantId,
      comercioId,
      membershipId,
      staffId: dto.staffId,
      personId,
      serviceId: service.id,
      startAt,
      endAt,
      status: AppointmentStatus.Confirmed,
      isProvisional: hasPaidOption,
      createdVia,
    });
    return this.appointments.save(appointment);
  }

  /**
   * Reserva un turno PAGANDO la sena (operacion critica de concurrencia).
   * Corre en transaccion con lock pesimista sobre el staff (mutex del calendario)
   * + RLS por tenant. Si hay un confirmado firme se rechaza; si hay provisionales
   * se desplazan (bumped) y se notifica.
   */
  async bookWithDeposit(
    tenantId: string,
    dto: BookWithDepositDto,
  ): Promise<{ appointment: Appointment; payment: Payment }> {
    const service = await this.loadService(tenantId, dto.serviceId);
    const option = dto.paymentOption ?? PaymentOption.Deposit;

    // Resuelve monto y tipo según la opción elegida (seña o pago completo).
    let amountCents: number;
    let paymentType: PaymentType;
    if (option === PaymentOption.Full) {
      if (!service.allowFullPayment) {
        throw new BadRequestException('Este servicio no admite pago completo');
      }
      amountCents = service.priceCents;
      paymentType = PaymentType.Service;
    } else {
      if (!service.allowDeposit) {
        throw new BadRequestException('Este servicio no admite seña');
      }
      if (!service.depositAmountCents || service.depositAmountCents <= 0) {
        throw new BadRequestException('El servicio no tiene monto de seña configurado');
      }
      amountCents = service.depositAmountCents;
      paymentType = PaymentType.Deposit;
    }

    const startAt = new Date(dto.startAt);
    const endAt = new Date(startAt.getTime() + service.durationMinutes * 60_000);
    const { comercioId, membershipId, minBookingHours } =
      await this.resolveComercioContext(service);
    this.assertLeadTime(startAt, minBookingHours);
    const personId = await this.resolvePersonId(dto);

    return this.tenantContext.runWithTenant(tenantId, async (manager) => {
      // Mutex: serializa las reservas de seña de este PROFESIONAL (su agenda es
      // única en todos sus comercios, no puede estar en dos lugares a la vez).
      // Advisory lock por transacción (se libera al COMMIT/ROLLBACK): no toma row
      // lock sobre `professional` (tabla referenciada por payments/notifications),
      // evitando contención con esos INSERT.
      await manager.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [tenantId]);

      const conflicts = await this.overlapping(manager, tenantId, startAt, endAt);

      const firmConflict = conflicts.find((a) => !a.isProvisional);
      if (firmConflict) {
        throw new ConflictException('El horario ya esta tomado');
      }

      // Desplaza provisionales que ocupan el horario.
      for (const prov of conflicts.filter((a) => a.isProvisional)) {
        prov.status = AppointmentStatus.Cancelled;
        prov.cancellationReason = CancellationReason.Bumped;
        await manager.save(prov);
        await this.notifications.enqueue({
          professionalId: tenantId,
          personId: prov.personId,
          channel: NotificationChannel.Email,
          type: NotificationType.Bumped,
          payload: { appointmentId: prov.id, startAt: prov.startAt.toISOString() },
        });
      }

      const appointment = await manager.save(
        manager.create(Appointment, {
          professionalId: tenantId,
          comercioId,
          membershipId,
          staffId: dto.staffId,
          personId,
          serviceId: service.id,
          startAt,
          endAt,
          status: AppointmentStatus.Confirmed,
          isProvisional: false,
          createdVia: CreatedVia.ClientSelf,
        }),
      );

      const isCash = dto.method === PaymentMethod.Cash;
      const payment = await manager.save(
        manager.create(Payment, {
          professionalId: tenantId,
          appointmentId: appointment.id,
          personId,
          type: paymentType,
          amountCents,
          method: dto.method,
          status: isCash ? PaymentStatus.Paid : PaymentStatus.Pending,
          paidAt: isCash ? new Date() : null,
        }),
      );

      await this.notifications.enqueue({
        professionalId: tenantId,
        personId,
        channel: NotificationChannel.Email,
        type: NotificationType.Deposit,
        payload: { appointmentId: appointment.id, amountCents: payment.amountCents },
      });

      return { appointment, payment };
    });
  }

  // ---- Consultas ----
  async findById(tenantId: string, id: string): Promise<Appointment> {
    const appointment = await this.appointments.findOne({
      where: { id, professionalId: tenantId },
    });
    if (!appointment) throw new NotFoundException('Turno no encontrado');
    return appointment;
  }

  async list(tenantId: string, staffId?: string): Promise<Appointment[]> {
    const appts = await this.appointments.find({
      where: { professionalId: tenantId, ...(staffId ? { staffId } : {}) },
      order: { startAt: 'ASC' },
      take: 500,
    });
    if (appts.length === 0) return appts;

    // Embebe nombre de cliente y servicio (campos derivados) para que el front
    // muestre nombres reales sin resolver cada relacion por su cuenta.
    const serviceIds = [...new Set(appts.map((a) => a.serviceId))];
    const personIds = [...new Set(appts.map((a) => a.personId))];
    const [services, persons] = await Promise.all([
      this.services.find({ where: { id: In(serviceIds) } }),
      this.persons.findByIds(personIds),
    ]);
    const serviceNameById = new Map(services.map((s) => [s.id, s.name]));
    const personNameById = new Map(persons.map((p) => [p.id, p.fullName]));

    for (const a of appts) {
      a.serviceName = serviceNameById.get(a.serviceId) ?? 'Servicio';
      a.personName = personNameById.get(a.personId) ?? '';
    }
    return appts;
  }

  // ---- Transiciones de estado ----
  private async transition(
    tenantId: string,
    id: string,
    apply: (a: Appointment) => void,
  ): Promise<Appointment> {
    const appointment = await this.findById(tenantId, id);
    apply(appointment);
    const saved = await this.appointments.save(appointment);
    await this.emitWaitingRoom(tenantId, appointment.staffId);
    return saved;
  }

  confirm(tenantId: string, id: string): Promise<Appointment> {
    return this.transition(tenantId, id, (a) => {
      if (a.status !== AppointmentStatus.Requested) {
        throw new BadRequestException('Solo se confirman turnos en estado requested');
      }
      a.status = AppointmentStatus.Confirmed;
    });
  }

  start(tenantId: string, id: string): Promise<Appointment> {
    return this.transition(tenantId, id, (a) => {
      if (a.status !== AppointmentStatus.Confirmed) {
        throw new BadRequestException('Solo se inician turnos confirmados');
      }
      a.status = AppointmentStatus.InProgress;
      a.actualStartAt = new Date();
    });
  }

  complete(tenantId: string, id: string): Promise<Appointment> {
    return this.transition(tenantId, id, (a) => {
      if (a.status !== AppointmentStatus.InProgress) {
        throw new BadRequestException('Solo se completan turnos en progreso');
      }
      a.status = AppointmentStatus.Done;
    });
  }

  noShow(tenantId: string, id: string): Promise<Appointment> {
    return this.transition(tenantId, id, (a) => {
      a.status = AppointmentStatus.NoShow;
      a.cancellationReason = CancellationReason.NoShow;
    });
  }

  cancel(
    tenantId: string,
    id: string,
    reason: CancellationReason = CancellationReason.Client,
  ): Promise<Appointment> {
    return this.transition(tenantId, id, (a) => {
      if ([AppointmentStatus.Done, AppointmentStatus.Cancelled].includes(a.status)) {
        throw new BadRequestException('El turno no se puede cancelar en su estado actual');
      }
      a.status = AppointmentStatus.Cancelled;
      a.cancellationReason = reason;
    });
  }

  // ---- Sala de espera (ETA) ----
  async computeWaitingRoom(tenantId: string, staffId: string): Promise<QueueUpdatePayload> {
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date();
    dayEnd.setHours(23, 59, 59, 999);

    const appts = await this.appointments.find({
      where: {
        professionalId: tenantId,
        staffId,
        status: In([AppointmentStatus.Confirmed, AppointmentStatus.InProgress]),
        startAt: Between(dayStart, dayEnd),
      },
      order: { startAt: 'ASC' },
    });

    const serviceIds = [...new Set(appts.map((a) => a.serviceId))];
    const services = serviceIds.length
      ? await this.services.find({ where: { id: In(serviceIds) } })
      : [];
    const durationById = new Map(services.map((s) => [s.id, s.durationMinutes]));

    let cursor = Date.now();
    const inProgress = appts.find((a) => a.status === AppointmentStatus.InProgress);
    if (inProgress?.actualStartAt) {
      const dur = durationById.get(inProgress.serviceId) ?? 30;
      cursor = Math.max(cursor, inProgress.actualStartAt.getTime() + dur * 60_000);
    }

    const queue = appts
      .filter((a) => a.status === AppointmentStatus.Confirmed)
      .map((a) => {
        const estimatedStartAt = new Date(cursor);
        const dur = durationById.get(a.serviceId) ?? 30;
        cursor += dur * 60_000;
        return {
          appointmentId: a.id,
          personId: a.personId,
          status: a.status,
          estimatedStartAt: estimatedStartAt.toISOString(),
        };
      });

    return { staffId, generatedAt: new Date().toISOString(), queue };
  }

  private async emitWaitingRoom(tenantId: string, staffId: string): Promise<void> {
    const payload = await this.computeWaitingRoom(tenantId, staffId);
    this.waitingRoom.emitQueueUpdate(payload);
  }
}
