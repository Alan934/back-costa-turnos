import { randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, EntityManager, In, Repository } from 'typeorm';
import { DateTime } from 'luxon';
import { uuidv7 } from 'uuidv7';
import {
  AppointmentStatus,
  CancellationReason,
  CashOutcome,
  CreatedVia,
  NotificationChannel,
  NotificationType,
  PaymentMethod,
  PaymentOption,
  PaymentStatus,
  PaymentType,
  ProfessionalClientStatus,
  WaitingRoomStatus,
} from '@/common/enums';
import { TenantContextService } from '@/common/context/tenant-context.service';
import { PersonsService } from '@/modules/identity/persons.service';
import { ComerciosService } from '@/modules/comercios/comercios.service';
import { Membership } from '@/modules/comercios/entities/membership.entity';
import { Service } from '@/modules/catalog/entities/service.entity';
import { CatalogService } from '@/modules/catalog/catalog.service';
import { computePrice, resolveServiceVat } from '@/modules/catalog/pricing';
import { Professional } from '@/modules/professionals/entities/professional.entity';
import { ServiceCombinationRule } from '@/modules/catalog/entities/service-combination-rule.entity';
import { ServiceCombinationRulesService } from '@/modules/catalog/service-combination-rules.service';
import { AvailabilityService } from '@/modules/availability/availability.service';
import { SubscriptionsService } from '@/modules/subscriptions/subscriptions.service';
import { Staff } from '@/modules/professionals/entities/staff.entity';
import { Payment } from '@/modules/payments/entities/payment.entity';
import { ProfessionalClient } from '@/modules/clients/entities/professional-client.entity';
import { NotificationsService } from '@/modules/notifications/notifications.service';
import { PaymentsService } from '@/modules/payments/payments.service';
import { AppointmentConfirmer } from '@/modules/payments/ports/appointment-confirmer.port';
import { Appointment } from './entities/appointment.entity';
import { AppointmentAddon } from './entities/appointment-addon.entity';
import { AddonBookingSnapshot, PendingBooking } from './entities/pending-booking.entity';
import { BookAppointmentDto, BookWithDepositDto, ClientRefDto } from './dto/appointment.dto';
import {
  MyWaitingSpotDto,
  NO_SERVICE_LABEL,
  SelfCheckInResultDto,
  WaitingItemDto,
  WaitingRoomDto,
  WaitingRoomStatsDto,
  LeaveResultDto,
} from './dto/waiting-room.dto';
import { WalkInStatusDto, WalkInWindowDto } from '@/modules/availability/dto/availability.dto';
import { WaitingRoomGateway } from './waiting-room.gateway';
import { WaitingRoomNotifier } from './waiting-room.notifier';
import { PushService, BrowserSubscription } from '@/modules/push/push.service';

// Estados que ocupan un horario.
const ACTIVE_STATUSES = [
  AppointmentStatus.Requested,
  AppointmentStatus.Confirmed,
  AppointmentStatus.InProgress,
];

// Estados finales: el turno ya no vuelve a la fila.
const TERMINAL_STATUSES = [
  AppointmentStatus.Done,
  AppointmentStatus.NoShow,
  AppointmentStatus.Cancelled,
];

/** Cuántas veces puede un cliente usar "me voy y vuelvo" (que no sea una excusa para no esperar). */
const MAX_AWAYS = 2;

// Métodos de cobro fuera del sistema (efectivo, transferencia/QR): precio base sin IVA,
// turno fijo, el profesional confirma el cobro en persona (cierre de caja).
const OFF_SYSTEM_METHODS = [PaymentMethod.Cash, PaymentMethod.Transfer];

/** Minutos que un horario queda reservado (hold) mientras se paga con MercadoPago. */
const HOLD_TTL_MINUTES = 15;

/** Sin membresía resuelta no hay franjas: la sala funciona como siempre. */
const EMPTY_ATTENDANCE: WalkInStatusDto = {
  walkInOnly: false,
  hasSchedule: false,
  openNow: true,
  todayWindows: [],
  nextWindow: null,
  windows: [],
};

const DAY_NAMES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/** " Próxima franja: el sábado de 09:00 a 13:00." (o vacío si no hay ninguna). */
function describeNextWindow(next: WalkInWindowDto | null): string {
  if (!next) return '';
  return ` Próxima franja: el ${DAY_NAMES[next.dayOfWeek]} de ${next.startTime} a ${next.endTime}.`;
}

/**
 * Orden de la cola de la sala: primero los marcados como prioritarios; dentro de cada
 * grupo, por `queueRank` (que el profesional puede reescribir al reordenar; por defecto
 * es el instante de llegada) y, a igualdad, por número de turno.
 */
function byQueueOrder(a: Appointment, b: Appointment): number {
  if (a.isPriority !== b.isPriority) return a.isPriority ? -1 : 1;
  const ra = a.queueRank ?? a.checkedInAt?.getTime() ?? 0;
  const rb = b.queueRank ?? b.checkedInAt?.getTime() ?? 0;
  return ra - rb || (a.ticketNumber ?? 0) - (b.ticketNumber ?? 0);
}

@Injectable()
export class AppointmentsService implements OnModuleInit, AppointmentConfirmer {
  private readonly logger = new Logger(AppointmentsService.name);

  constructor(
    @InjectRepository(Appointment)
    private readonly appointments: Repository<Appointment>,
    @InjectRepository(Service)
    private readonly services: Repository<Service>,
    @InjectRepository(Professional)
    private readonly professionals: Repository<Professional>,
    @InjectRepository(ServiceCombinationRule)
    private readonly combinationRuleRepo: Repository<ServiceCombinationRule>,
    @InjectRepository(Payment)
    private readonly payments: Repository<Payment>,
    @InjectRepository(Staff)
    private readonly staff: Repository<Staff>,
    @InjectRepository(ProfessionalClient)
    private readonly professionalClients: Repository<ProfessionalClient>,
    @InjectRepository(PendingBooking)
    private readonly pendingBookings: Repository<PendingBooking>,
    @InjectRepository(AppointmentAddon)
    private readonly addons: Repository<AppointmentAddon>,
    private readonly persons: PersonsService,
    private readonly tenantContext: TenantContextService,
    private readonly notifications: NotificationsService,
    private readonly waitingRoom: WaitingRoomGateway,
    private readonly comercios: ComerciosService,
    private readonly paymentsService: PaymentsService,
    private readonly combinationRules: ServiceCombinationRulesService,
    private readonly catalog: CatalogService,
    private readonly availability: AvailabilityService,
    private readonly subscriptions: SubscriptionsService,
    private readonly notifier: WaitingRoomNotifier,
    private readonly push: PushService,
  ) {}

  /** Se registra como confirmador para que el webhook de pagos cree el turno. */
  onModuleInit(): void {
    this.paymentsService.registerAppointmentConfirmer(this);
  }

  /**
   * Rechaza una reserva con horario dentro de una franja por orden de llegada. La pantalla ya no
   * ofrece esos horarios, pero la API es pública: sin esta guarda alguien podría reservar un
   * turno en un tramo donde el profesional atiende solo por llegada.
   */
  private async assertNotWalkInSlot(
    membershipId: string,
    serviceId: string,
    startAt: string,
  ): Promise<void> {
    const membership = await this.comercios.getMembershipById(membershipId);
    if (await this.availability.isWalkInAt(membership, serviceId, new Date(startAt))) {
      throw new BadRequestException(
        'En ese horario se atiende por orden de llegada: no se reservan turnos. Anotate en la sala de espera del local.',
      );
    }
  }

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

  /**
   * Reserva pública (sin pago) en un comercio, eligiendo al profesional por membresía.
   * Si `accountId` viene (cliente logueado), el turno se ata a la Person de su cuenta.
   */
  async bookForMembership(
    membershipId: string,
    dto: { serviceId: string; startAt: string } & ClientRefDto,
    createdVia: CreatedVia,
    accountId?: string | null,
  ): Promise<Appointment> {
    const { professionalId, staffId } = await this.resolveMembershipBookingTarget(membershipId);
    // Lo que reserva el propio cliente respeta las franjas por orden de llegada; el profesional
    // puede cargar un turno a mano donde quiera.
    if (createdVia === CreatedVia.ClientSelf) {
      await this.assertNotWalkInSlot(membershipId, dto.serviceId, dto.startAt);
    }
    return this.book(professionalId, { ...dto, staffId }, createdVia, accountId);
  }

  /**
   * Reserva pública con seña/pago completo en un comercio, eligiendo al profesional.
   * Si `accountId` viene (cliente logueado), el turno se ata a la Person de su cuenta.
   */
  async bookWithDepositForMembership(
    membershipId: string,
    dto: {
      serviceId: string;
      startAt: string;
      method: PaymentMethod;
      paymentOption?: PaymentOption;
      addonServiceIds?: string[];
    } & ClientRefDto,
    accountId?: string | null,
  ): Promise<{ appointment: Appointment | null; payment: Payment; mpInitPoint?: string }> {
    const { professionalId, staffId } = await this.resolveMembershipBookingTarget(membershipId);
    await this.assertNotWalkInSlot(membershipId, dto.serviceId, dto.startAt);
    return this.bookWithDeposit(professionalId, { ...dto, staffId }, accountId);
  }

  // ---- Reservas "cualquiera" (servicio del comercio, el back elige profesional) ----

  /**
   * Reserva (sin pago) eligiendo automáticamente un profesional que ofrezca el
   * servicio y esté libre en `startAt`: el de **menor carga ese día**. 409 si
   * ninguno queda disponible. La respuesta indica quién quedó asignado.
   */
  async bookForService(
    comercioId: string,
    serviceId: string,
    dto: { serviceId: string; startAt: string; addonServiceIds?: string[] } & ClientRefDto,
    createdVia: CreatedVia,
    accountId?: string | null,
  ): Promise<Appointment> {
    const candidates = await this.rankCandidates(
      comercioId,
      serviceId,
      dto.startAt,
      dto.addonServiceIds ?? [],
    );
    const bookDto = { ...dto, serviceId };
    let lastError: unknown;
    for (const membership of candidates) {
      try {
        const appointment = await this.bookForMembership(
          membership.id,
          bookDto,
          createdVia,
          accountId,
        );
        appointment.professionalDisplayName = membership.professional?.businessName;
        return appointment;
      } catch (err) {
        if (err instanceof ConflictException) {
          lastError = err;
          continue;
        }
        throw err;
      }
    }
    throw lastError instanceof ConflictException
      ? lastError
      : new ConflictException('Ningún profesional quedó disponible para ese horario.');
  }

  /** Reserva con seña/pago completo eligiendo profesional automáticamente (ver bookForService). */
  async bookWithDepositForService(
    comercioId: string,
    serviceId: string,
    dto: {
      serviceId: string;
      startAt: string;
      method: PaymentMethod;
      paymentOption?: PaymentOption;
      addonServiceIds?: string[];
    } & ClientRefDto,
    accountId?: string | null,
  ): Promise<{ appointment: Appointment | null; payment: Payment; mpInitPoint?: string }> {
    const candidates = await this.rankCandidates(
      comercioId,
      serviceId,
      dto.startAt,
      dto.addonServiceIds ?? [],
    );
    const bookDto = { ...dto, serviceId };
    let lastError: unknown;
    for (const membership of candidates) {
      try {
        const result = await this.bookWithDepositForMembership(membership.id, bookDto, accountId);
        if (result.appointment) {
          result.appointment.professionalDisplayName = membership.professional?.businessName;
        }
        return result;
      } catch (err) {
        if (err instanceof ConflictException) {
          lastError = err;
          continue;
        }
        throw err;
      }
    }
    throw lastError instanceof ConflictException
      ? lastError
      : new ConflictException('Ningún profesional quedó disponible para ese horario.');
  }

  /**
   * Profesionales (membresías activas, con professional cargado) que ofrecen el
   * servicio, tienen acceso de escritura (suscripción) y un slot libre en `startAt`,
   * ordenados por **menor carga ese día** (en la zona del comercio).
   */
  private async rankCandidates(
    comercioId: string,
    serviceId: string,
    startAt: string,
    addonServiceIds: string[],
  ): Promise<Membership[]> {
    const comercio = await this.comercios.getComercio(comercioId);
    const memberships = (await this.catalog.activeAssignedMemberships(serviceId)).filter(
      (m) => m.comercioId === comercioId,
    );

    const start = new Date(startAt);
    const day = DateTime.fromJSDate(start, { zone: comercio.timezone }).toISODate();
    if (!day) throw new BadRequestException('startAt inválido');

    const scored: { membership: Membership; load: number }[] = [];
    for (const membership of memberships) {
      if (!(await this.hasWriteAccess(membership.professionalId))) continue;
      const slots = await this.availability.computeSlotsByMembership(
        membership.id,
        serviceId,
        day,
        day,
        addonServiceIds,
      );
      const free = slots.some((s) => new Date(s.startAt).getTime() === start.getTime());
      if (!free) continue;
      const load = await this.dayLoad(membership.professionalId, start, comercio.timezone);
      scored.push({ membership, load });
    }
    scored.sort((a, b) => a.load - b.load);
    return scored.map((s) => s.membership);
  }

  /** true si el profesional puede recibir reservas (sin suscripción vencida). */
  private async hasWriteAccess(professionalId: string): Promise<boolean> {
    const sub = await this.subscriptions.getByTenant(professionalId).catch(() => null);
    return !sub || this.subscriptions.hasWriteAccess(sub);
  }

  /** Cantidad de turnos activos del profesional en el día (zona del comercio) de `instant`. */
  private dayLoad(professionalId: string, instant: Date, zone: string): Promise<number> {
    const day = DateTime.fromJSDate(instant, { zone });
    const dayStart = day.startOf('day').toUTC().toJSDate();
    const dayEnd = day.endOf('day').toUTC().toJSDate();
    return this.appointments.count({
      where: {
        professionalId,
        status: In(ACTIVE_STATUSES),
        startAt: Between(dayStart, dayEnd),
      },
    });
  }

  /**
   * Servicio activo (cualquier comercio) + la membresía activa del profesional en
   * el comercio del servicio, validando que lo ofrezca. Es el contexto real del
   * turno: comercio/membresía salen de quien reserva, no del creador del servicio.
   */
  private async resolveBookingMembership(
    professionalId: string,
    service: Service,
  ): Promise<Membership> {
    const membership = await this.comercios.getActiveMembership(professionalId, service.comercioId);
    if (!(await this.catalog.isAssigned(service.id, membership.id))) {
      throw new NotFoundException('El profesional no ofrece este servicio');
    }
    return membership;
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

  /**
   * Ventana máxima: el turno no puede empezar más de `maxBookingDays` días después
   * de "ahora". 0 = sin límite.
   */
  private assertMaxBookingWindow(startAt: Date, maxBookingDays: number): void {
    if (maxBookingDays <= 0) return;
    const latest = Date.now() + maxBookingDays * 24 * 60 * 60_000;
    if (startAt.getTime() > latest) {
      throw new BadRequestException(
        `El turno no puede reservarse con más de ${maxBookingDays} días de anticipación`,
      );
    }
  }

  private async resolvePersonId(ref: ClientRefDto, accountId?: string | null): Promise<string> {
    // Cliente logueado: el turno es de la Person de su cuenta, sin importar el
    // teléfono/email tipeados (que igual quedan como datos de contacto del DTO).
    // Así el turno aparece en su dashboard (/me/appointments lo busca por accountId).
    if (accountId) {
      const person = await this.persons.findOrCreateForAccount(accountId, {
        fullName: ref.fullName ?? 'Cliente',
        email: ref.email ?? null,
        phone: ref.phone ?? null,
      });
      return person.id;
    }
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

  /**
   * Garantiza el vínculo professional_client (la "membresía" cliente↔profesional)
   * para que la persona aparezca en Clientes tras reservar. Idempotente: si ya
   * existe no hace nada y no pisa el status (no "desarchiva"). Acepta un manager
   * opcional para correr dentro de la transacción de la reserva con seña.
   */
  private async ensureProfessionalClient(
    professionalId: string,
    personId: string,
    manager?: EntityManager,
  ): Promise<void> {
    // No vincular al dueño como cliente de sí mismo: si la persona resuelta pertenece
    // a la cuenta del propio profesional (reserva con su mismo email/teléfono, o estando
    // logueado), no se crea la membresía. Evita que figure en su propia cartera.
    if (await this.isOwnerPerson(professionalId, personId, manager)) return;

    const repo = manager ? manager.getRepository(ProfessionalClient) : this.professionalClients;
    // El QueryBuilder NO dispara el hook @BeforeInsert de BaseEntity, asi que la PK
    // (uuid v7 generada en la app) hay que setearla explicitamente o queda NULL.
    await repo
      .createQueryBuilder()
      .insert()
      .into(ProfessionalClient)
      .values({ id: uuidv7(), professionalId, personId, status: ProfessionalClientStatus.Active })
      .orIgnore() // respeta uq_professional_client(professional_id, person_id)
      .execute();
  }

  /**
   * true si `personId` es una identidad de la cuenta dueña del tenant. La detección
   * es por accountId (no por email), así también atrapa el caso borde de la persona
   * sin email vinculada solo por teléfono.
   */
  private async isOwnerPerson(
    professionalId: string,
    personId: string,
    manager?: EntityManager,
  ): Promise<boolean> {
    const profRepo = manager ? manager.getRepository(Professional) : this.professionals;
    const professional = await profRepo.findOne({ where: { id: professionalId } });
    if (!professional?.accountId) return false;
    const person = await this.persons.findById(personId);
    return person?.accountId != null && person.accountId === professional.accountId;
  }

  private async loadService(serviceId: string): Promise<Service> {
    const service = await this.services.findOne({ where: { id: serviceId, isActive: true } });
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
   * Reservas pendientes de pago (pending_booking) NO vencidas que solapan
   * [start,end) para este profesional. Cada una mantiene un "hold" del horario
   * mientras el cliente paga con MercadoPago: bloquea como si fuera un turno firme.
   */
  private pendingHolds(
    manager: EntityManager | Repository<PendingBooking>,
    professionalId: string,
    start: Date,
    end: Date,
  ): Promise<PendingBooking[]> {
    const repo = manager instanceof Repository ? manager : manager.getRepository(PendingBooking);
    return repo
      .createQueryBuilder('p')
      .where('p.professional_id = :professionalId', { professionalId })
      .andWhere('p.expires_at > now()')
      .andWhere('p.start_at < :end AND p.end_at > :start', { start, end })
      .getMany();
  }

  /**
   * Reserva un turno SIN pagar.
   * - Si el servicio NO permite "sin pago" -> rechaza (hay que pagar seña o total).
   * - Si la membresía habilita reservas provisionales Y el servicio admite pago ->
   *   queda provisional (desplazable por alguien que pague). En otro caso queda
   *   confirmado firme (default: no provisional).
   */
  async book(
    tenantId: string,
    dto: BookAppointmentDto,
    createdVia: CreatedVia,
    accountId?: string | null,
  ): Promise<Appointment> {
    const service = await this.loadService(dto.serviceId);
    if (!service.allowNoPayment) {
      throw new BadRequestException(
        'Este servicio requiere pago (seña o total) para reservar el turno',
      );
    }

    const membership = await this.resolveBookingMembership(tenantId, service);
    const comercioId = membership.comercioId;
    const membershipId = membership.id;

    const addonPricings = await this.combinationRules.resolveAddons(
      membershipId,
      service,
      dto.addonServiceIds ?? [],
    );
    const totalDuration =
      service.durationMinutes + addonPricings.reduce((s, a) => s + a.service.durationMinutes, 0);

    const startAt = new Date(dto.startAt);
    const endAt = new Date(startAt.getTime() + totalDuration * 60_000);
    this.assertLeadTime(startAt, membership.minBookingHours);
    this.assertMaxBookingWindow(startAt, membership.maxBookingDays);
    const personId = await this.resolvePersonId(dto, accountId);

    const conflicts = await this.overlapping(this.appointments, tenantId, startAt, endAt);
    const holds = await this.pendingHolds(this.pendingBookings, tenantId, startAt, endAt);

    const otherServiceConflict = conflicts.some((a) => a.serviceId !== service.id);
    const otherServiceHold = holds.some((h) => h.serviceId !== service.id);
    const sameServiceCount =
      conflicts.filter((a) => a.serviceId === service.id).length +
      holds.filter((h) => h.serviceId === service.id).length;

    // Otro servicio en el mismo horario → el profesional está ocupado.
    // O el cupo del servicio está lleno → sin lugar.
    if (otherServiceConflict || otherServiceHold || sameServiceCount >= service.capacity) {
      throw new ConflictException('El horario ya no esta disponible.');
    }

    // Provisional (desplazable) solo si el profesional lo habilitó para su agenda
    // en este comercio Y el servicio además admite pago. Si no, el turno sin seña
    // queda firme y nadie lo puede desplazar.
    const hasPaidOption = service.allowDeposit || service.allowFullPayment;
    const isProvisional = membership.allowProvisionalBookings && hasPaidOption;
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
      isProvisional,
      createdVia,
    });
    const saved = await this.appointments.save(appointment);
    await this.ensureProfessionalClient(tenantId, personId);
    if (addonPricings.length > 0) {
      await this.addons.save(
        addonPricings.map((a) =>
          this.addons.create({
            appointmentId: saved.id,
            serviceId: a.service.id,
            professionalId: tenantId,
            serviceNameSnapshot: a.service.name,
            priceAtBookingCents: a.priceAtBookingCents,
            discountAppliedCents: a.discountAppliedCents,
            isFree: a.isFree,
          }),
        ),
      );
    }
    return saved;
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
    accountId?: string | null,
  ): Promise<{ appointment: Appointment | null; payment: Payment; mpInitPoint?: string }> {
    const service = await this.loadService(dto.serviceId);
    const option = dto.paymentOption ?? PaymentOption.Deposit;

    // El front ya lo bloquea por UX, pero el back rechaza igual: cobrar online
    // exige que el profesional tenga su MercadoPago conectado.
    if (
      dto.method === PaymentMethod.MercadoPago &&
      !(await this.comercios.hasMpConnected(tenantId))
    ) {
      throw new BadRequestException(
        'El profesional no tiene MercadoPago conectado: no puede cobrar online.',
      );
    }

    const membership = await this.resolveBookingMembership(tenantId, service);
    const comercioId = membership.comercioId;
    const membershipId = membership.id;

    // Resuelve y valida los add-ons antes de abrir la transacción.
    const addonPricings = await this.combinationRules.resolveAddons(
      membershipId,
      service,
      dto.addonServiceIds ?? [],
    );
    const addonData: AddonBookingSnapshot[] = addonPricings.map((a) => ({
      serviceId: a.service.id,
      serviceNameSnapshot: a.service.name,
      priceAtBookingCents: a.priceAtBookingCents,
      discountAppliedCents: a.discountAppliedCents,
      isFree: a.isFree,
    }));
    const addonDuration = addonPricings.reduce((s, a) => s + a.service.durationMinutes, 0);

    const isOffSystem = OFF_SYSTEM_METHODS.includes(dto.method);

    // Resuelve monto base y tipo. Efectivo/transferencia siempre cobran el precio
    // completo del servicio (tal cual lo cargó el profesional, sin IVA), sin importar
    // paymentOption. Online (MP) respeta la opción elegida (seña o pago completo).
    let baseCents: number;
    let paymentType: PaymentType;
    if (isOffSystem) {
      if (dto.method === PaymentMethod.Cash && !service.allowCash) {
        throw new BadRequestException('Este servicio no admite pago en efectivo');
      }
      if (dto.method === PaymentMethod.Transfer && !service.allowTransfer) {
        throw new BadRequestException('Este servicio no admite pago por transferencia');
      }
      baseCents = service.priceCents;
      paymentType = PaymentType.Service;
    } else if (option === PaymentOption.Full) {
      if (!service.allowFullPayment) {
        throw new BadRequestException('Este servicio no admite pago completo');
      }
      baseCents = service.priceCents;
      paymentType = PaymentType.Service;
    } else {
      if (!service.allowDeposit) {
        throw new BadRequestException('Este servicio no admite seña');
      }
      if (!service.depositAmountCents || service.depositAmountCents <= 0) {
        throw new BadRequestException('El servicio no tiene monto de seña configurado');
      }
      baseCents = service.depositAmountCents;
      paymentType = PaymentType.Deposit;
    }

    // IVA: solo en pagos por Mercado Pago, sobre el monto que se cobra (seña o total).
    // En efectivo/transferencia no hay IVA (cobro fuera del sistema). Se aplica el IVA
    // efectivo del servicio (override) o, si es null, el default del profesional.
    let vatPercent = 0;
    let vatAmountCents = 0;
    if (!isOffSystem) {
      const professional = await this.professionals.findOne({ where: { id: tenantId } });
      const vat = resolveServiceVat(service, professional);
      vatPercent = vat.percent;
      vatAmountCents = computePrice(baseCents, vat.percent, vat.chargedToClient).vatAmountCents;
    }
    // amountCents = lo que efectivamente paga el cliente (base + IVA en MP).
    const amountCents = baseCents + vatAmountCents;

    const totalDuration = service.durationMinutes + addonDuration;
    const startAt = new Date(dto.startAt);
    const endAt = new Date(startAt.getTime() + totalDuration * 60_000);
    this.assertLeadTime(startAt, membership.minBookingHours);
    this.assertMaxBookingWindow(startAt, membership.maxBookingDays);
    const personId = await this.resolvePersonId(dto, accountId);

    const { appointment, payment } = await this.tenantContext.runWithTenant(
      tenantId,
      async (manager) => {
        // Mutex: serializa las reservas de seña de este PROFESIONAL (su agenda es
        // única en todos sus comercios, no puede estar en dos lugares a la vez).
        // Advisory lock por transacción (se libera al COMMIT/ROLLBACK): no toma row
        // lock sobre `professional` (tabla referenciada por payments/notifications),
        // evitando contención con esos INSERT.
        await manager.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [tenantId]);

        const conflicts = await this.overlapping(manager, tenantId, startAt, endAt);
        const holds = await this.pendingHolds(manager, tenantId, startAt, endAt);

        // Otro servicio en el horario → el profesional está ocupado (no puede
        // atender dos servicios distintos al mismo tiempo).
        // Holds de otro servicio → idem.
        const otherServiceConflict = conflicts.some((a) => a.serviceId !== service.id);
        const otherServiceHold = holds.some((h) => h.serviceId !== service.id);
        if (otherServiceConflict || otherServiceHold) {
          throw new ConflictException('El horario ya esta tomado');
        }

        // Turnos del mismo servicio partidos por firmeza.
        const sameConflicts = conflicts.filter((a) => a.serviceId === service.id);
        const firmSame = sameConflicts.filter((a) => !a.isProvisional);
        const provSame = sameConflicts.filter((a) => a.isProvisional);
        // Los holds del mismo servicio se cuentan como spots firmes (pago en proceso,
        // no se pueden desplazar).
        const sameHolds = holds.filter((h) => h.serviceId === service.id);
        const firmOccupied = firmSame.length + sameHolds.length;

        if (firmOccupied >= service.capacity) {
          throw new ConflictException('El horario ya esta tomado');
        }

        // Cuántos provisionales hay que desplazar para que, sumando el nuevo turno,
        // el cupo no se supere. provToKeep = capacity - firmOccupied - 1 (la nueva reserva).
        const provToKeep = service.capacity - firmOccupied - 1;
        const provToBump = provSame.slice(Math.max(0, provToKeep));

        // EFECTIVO/TRANSFERENCIA: el turno se confirma firme en el acto (no hay checkout)
        // y bumpea provisionales que sobren. El Payment queda PENDIENTE: el cobro se
        // confirma en persona al finalizar el turno (ver complete() / cierre de caja),
        // para no dar por cobrado dinero que todavía no se recibió. Nunca lleva IVA.
        if (isOffSystem) {
          for (const prov of provToBump) {
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
          await this.ensureProfessionalClient(tenantId, personId, manager);
          if (addonData.length > 0) {
            await manager.save(
              addonData.map((a) =>
                manager.create(AppointmentAddon, {
                  appointmentId: appointment.id,
                  serviceId: a.serviceId,
                  professionalId: tenantId,
                  serviceNameSnapshot: a.serviceNameSnapshot,
                  priceAtBookingCents: a.priceAtBookingCents,
                  discountAppliedCents: a.discountAppliedCents,
                  isFree: a.isFree,
                }),
              ),
            );
          }

          const payment = await manager.save(
            manager.create(Payment, {
              professionalId: tenantId,
              appointmentId: appointment.id,
              personId,
              type: paymentType,
              amountCents,
              vatPercent: 0,
              vatAmountCents: 0,
              method: dto.method,
              status: PaymentStatus.Pending,
              paidAt: null,
            }),
          );
          await this.notifications.enqueue({
            professionalId: tenantId,
            personId,
            channel: NotificationChannel.Email,
            type: NotificationType.Deposit,
            payload: { appointmentId: appointment.id, amountCents: payment.amountCents },
          });
          return { appointment: appointment, payment };
        }

        // MERCADOPAGO (F4): NO se crea el turno todavía. Solo el Payment Pending y
        // un pending_booking que reserva el horario (hold) y guarda los datos para
        // que el webhook cree el Appointment al acreditar. Sin notificación ni
        // ensureProfessionalClient: eso ocurre recién al confirmar el pago.
        const payment = await manager.save(
          manager.create(Payment, {
            professionalId: tenantId,
            appointmentId: null,
            personId,
            type: paymentType,
            amountCents,
            vatPercent,
            vatAmountCents,
            method: dto.method,
            status: PaymentStatus.Pending,
            paidAt: null,
          }),
        );
        await manager.save(
          manager.create(PendingBooking, {
            professionalId: tenantId,
            comercioId,
            membershipId,
            staffId: dto.staffId,
            personId,
            serviceId: service.id,
            startAt,
            endAt,
            paymentId: payment.id,
            amountCents,
            paymentType,
            paymentOption: option,
            expiresAt: new Date(Date.now() + HOLD_TTL_MINUTES * 60_000),
            addonData: addonData.length > 0 ? addonData : null,
          }),
        );
        return { appointment: null as Appointment | null, payment };
      },
    );

    // El pago con MercadoPago necesita una preferencia (init_point) para que el
    // cliente sea redirigido al checkout. Se crea fuera de la transacción (el pago
    // ya está commiteado) con el token del PROFESIONAL y back_url a /reserva/resultado.
    if (dto.method === PaymentMethod.MercadoPago && payment.status === PaymentStatus.Pending) {
      try {
        const { initPoint } = await this.paymentsService.createMercadoPagoPreference(
          tenantId,
          payment.id,
          dto.email ?? null,
        );
        return { appointment, payment, mpInitPoint: initPoint };
      } catch (err) {
        // Si no se pudo abrir el checkout, no dejar el hold fantasma: borra el
        // pending_booking (y el pago en cascada) para liberar el horario.
        await this.pendingBookings.delete({ paymentId: payment.id });
        await this.payments.delete({ id: payment.id });
        throw err;
      }
    }

    return { appointment, payment };
  }

  /**
   * (AppointmentConfirmer) Lo llama el webhook de pagos cuando un pago de turno se
   * acredita y todavía no tiene Appointment (flujo MercadoPago F4): crea el turno
   * a partir del pending_booking y lo borra. Idempotente y serializado por el mismo
   * advisory lock que bookWithDeposit.
   */
  async confirmPaidBooking(payment: Payment): Promise<void> {
    await this.tenantContext.runWithTenant(payment.professionalId, async (manager) => {
      await manager.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [
        payment.professionalId,
      ]);

      // Idempotencia: si otro webhook ya creó el turno para este pago, salir.
      const current = await manager.findOne(Payment, { where: { id: payment.id } });
      if (current?.appointmentId) return;

      const pending = await manager.findOne(PendingBooking, {
        where: { paymentId: payment.id },
      });
      if (!pending) {
        // El hold expiró y fue limpiado, o webhook tardío sin datos del slot.
        this.logger.warn(
          `Pago ${payment.id} acreditado sin pending_booking: no se pudo crear el turno`,
        );
        return;
      }

      const conflicts = await this.overlapping(
        manager,
        payment.professionalId,
        pending.startAt,
        pending.endAt,
      );
      // Desplaza provisionales que ocupen el horario (igual que en efectivo).
      for (const prov of conflicts.filter((a) => a.isProvisional)) {
        prov.status = AppointmentStatus.Cancelled;
        prov.cancellationReason = CancellationReason.Bumped;
        await manager.save(prov);
        await this.notifications.enqueue({
          professionalId: payment.professionalId,
          personId: prov.personId,
          channel: NotificationChannel.Email,
          type: NotificationType.Bumped,
          payload: { appointmentId: prov.id, startAt: prov.startAt.toISOString() },
        });
      }
      // El cliente ya pagó: si el slot quedó tomado por un firme (hold vencido +
      // carrera), se crea igual y se loguea para resolución manual (overbooking).
      const firmConflict = conflicts.find((a) => !a.isProvisional);
      if (firmConflict) {
        this.logger.warn(
          `Overbooking: pago ${payment.id} acreditado sobre un turno firme existente ` +
            `(${pending.startAt.toISOString()}). Revisar manualmente.`,
        );
      }

      const appointment = await manager.save(
        manager.create(Appointment, {
          professionalId: payment.professionalId,
          comercioId: pending.comercioId,
          membershipId: pending.membershipId,
          staffId: pending.staffId,
          personId: pending.personId,
          serviceId: pending.serviceId,
          startAt: pending.startAt,
          endAt: pending.endAt,
          status: AppointmentStatus.Confirmed,
          isProvisional: false,
          createdVia: CreatedVia.ClientSelf,
        }),
      );
      await this.ensureProfessionalClient(payment.professionalId, pending.personId, manager);
      if (pending.addonData && pending.addonData.length > 0) {
        await manager.save(
          pending.addonData.map((a) =>
            manager.create(AppointmentAddon, {
              appointmentId: appointment.id,
              serviceId: a.serviceId,
              professionalId: payment.professionalId,
              serviceNameSnapshot: a.serviceNameSnapshot,
              priceAtBookingCents: a.priceAtBookingCents,
              discountAppliedCents: a.discountAppliedCents,
              isFree: a.isFree,
            }),
          ),
        );
      }
      await manager.update(Payment, { id: payment.id }, { appointmentId: appointment.id });
      await manager.delete(PendingBooking, { id: pending.id });

      await this.notifications.enqueue({
        professionalId: payment.professionalId,
        personId: pending.personId,
        channel: NotificationChannel.Email,
        type: NotificationType.Deposit,
        payload: { appointmentId: appointment.id, amountCents: pending.amountCents },
      });
    });
  }

  /**
   * (AppointmentConfirmer) Libera el hold (borra el pending_booking) de un pago
   * fallido/cancelado, dejando el horario disponible de inmediato.
   */
  async releasePending(paymentId: string): Promise<void> {
    await this.pendingBookings.delete({ paymentId });
  }

  /**
   * Housekeeping: borra los pending_booking vencidos hace rato. Margen amplio (1h)
   * respecto al TTL (15 min) para no borrar uno que un webhook tardío esté por
   * confirmar. La corrección funcional NO depende de esto (el hold ya caduca por
   * expires_at); esto solo evita que la tabla crezca sin fin.
   */
  async purgeExpiredHolds(): Promise<number> {
    const res = await this.pendingBookings
      .createQueryBuilder()
      .delete()
      .where(`expires_at < now() - interval '1 hour'`)
      .execute();
    return res.affected ?? 0;
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

    // Embebe datos del cliente (nombre/telefono/email) y del servicio (campos
    // derivados) para que el front los muestre sin resolver cada relacion aparte.
    const serviceIds = [
      ...new Set(appts.map((a) => a.serviceId).filter((id): id is string => !!id)),
    ];
    const personIds = [...new Set(appts.map((a) => a.personId))];
    const [services, persons] = await Promise.all([
      serviceIds.length ? this.services.find({ where: { id: In(serviceIds) } }) : [],
      this.persons.findByIds(personIds),
    ]);
    const serviceNameById = new Map(services.map((s) => [s.id, s.name]));
    const personById = new Map(persons.map((p) => [p.id, p]));

    for (const a of appts) {
      a.serviceName = (a.serviceId && serviceNameById.get(a.serviceId)) || NO_SERVICE_LABEL;
      const person = personById.get(a.personId);
      a.personName = person?.fullName ?? '';
      a.personPhone = person?.phone ?? null;
      a.personEmail = person?.email ?? null;
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
    // Terminó, no vino o se canceló: ya no hay nadie esperando a quien avisarle.
    if (TERMINAL_STATUSES.includes(saved.status)) await this.push.clearAppointment(saved.id);
    await this.emitWaitingRoom(tenantId, appointment.staffId, appointment.comercioId);
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

  async start(tenantId: string, id: string): Promise<Appointment> {
    // Empezar a atender implica que la persona está presente: si el profesional
    // nunca marcó la llegada (arrancó desde la agenda), se marca ahora para que
    // aparezca como "atendiendo" en la sala y tenga su número de turno.
    const appointment = await this.findById(tenantId, id);
    if (appointment.status !== AppointmentStatus.Confirmed) {
      throw new BadRequestException('Solo se inician turnos confirmados');
    }
    await this.markArrival(appointment);
    const wasCalled = !!appointment.calledAt;
    const started = await this.transition(tenantId, id, (a) => {
      a.status = AppointmentStatus.InProgress;
      a.actualStartAt = new Date();
      a.awayUntil = null;
    });
    // Si el profesional pasó directo a "Atender" sin llamarlo antes, el cliente que
    // espera con el celular en el bolsillo se entera igual.
    if (!wasCalled) {
      await this.notifier.notifyCalled(started, await this.staffName(started.staffId));
    }
    return started;
  }

  async complete(
    tenantId: string,
    id: string,
    cashOutcome?: CashOutcome,
    note?: string,
  ): Promise<Appointment> {
    const appointment = await this.transition(tenantId, id, (a) => {
      if (a.status !== AppointmentStatus.InProgress) {
        throw new BadRequestException('Solo se completan turnos en progreso');
      }
      a.status = AppointmentStatus.Done;
      a.completedAt = new Date();
    });
    if (cashOutcome) {
      await this.applyCashOutcome(tenantId, id, cashOutcome, note);
    }
    return appointment;
  }

  /**
   * Confirma el cobro fuera de sistema (efectivo/transferencia) de un turno al
   * finalizarlo: marca el pago PENDIENTE del turno como cobrado (`Paid`) o como
   * pagaré (`Deferred`, el cliente quedó debiendo). No-op si el turno no tiene un
   * pago off-system pendiente (p. ej. se pagó por MercadoPago o ya se cerró antes).
   */
  private async applyCashOutcome(
    tenantId: string,
    appointmentId: string,
    outcome: CashOutcome,
    note?: string,
  ): Promise<void> {
    const payment = await this.payments.findOne({
      where: {
        professionalId: tenantId,
        appointmentId,
        method: In(OFF_SYSTEM_METHODS),
        status: PaymentStatus.Pending,
      },
    });
    if (!payment) return;
    if (outcome === CashOutcome.Collected) {
      payment.status = PaymentStatus.Paid;
      payment.paidAt = new Date();
    } else {
      payment.status = PaymentStatus.Deferred;
      payment.note = note ?? null;
    }
    await this.payments.save(payment);
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

  // ---- Sala de espera ----
  /**
   * Membresía cuya configuración de sala aplica. Si no viene una explícita, se
   * usa la personal del profesional (su comercio-de-uno) y, si no tiene, la
   * primera activa. Es la que define si la sala es pública, si acepta self
   * check-in y si está abierta/en pausa.
   */
  private async resolveWaitingRoomMembership(
    professionalId: string,
    membershipId?: string,
  ): Promise<Membership | null> {
    if (membershipId) return this.comercios.getMembershipById(membershipId);
    const personal = await this.comercios.getPersonalMembership(professionalId).catch(() => null);
    if (personal) return personal;
    const mine = await this.comercios.listMyMemberships(professionalId);
    return mine[0] ?? null;
  }

  /** Nombre de pila, para no exponer el apellido en una pantalla pública. */
  private firstName(fullName?: string | null): string {
    const first = (fullName ?? '').trim().split(/\s+/)[0];
    return first || 'Cliente';
  }

  /**
   * Estado de la sala de espera de una agenda (staff), hoy.
   *
   * La cola son SOLO los presentes (`checkedInAt` seteado): un turno agendado
   * para las 11 no ocupa lugar hasta que la persona llega, así la posición y el
   * ETA que ve el cliente no cuentan gente que todavía no apareció. Se ordena
   * por hora de llegada (a igual llegada, por hora del turno).
   *
   * `pending` son los self check-in que esperan que el profesional los acepte
   * (status `requested`): no cuentan para la posición ni para el ETA.
   */
  async computeWaitingRoom(
    tenantId: string,
    staffId: string,
    membershipId?: string,
  ): Promise<WaitingRoomDto> {
    const { start: dayStart, end: dayEnd } = await this.todayBounds(tenantId);

    const membership = await this.resolveWaitingRoomMembership(tenantId, membershipId);
    const [staff, appts] = await Promise.all([
      this.staff.findOne({ where: { id: staffId } }),
      this.appointments.find({
        where: {
          professionalId: tenantId,
          staffId,
          // Un walk-in de las 19:50 puede tener su `startAt` hoy y su fin mañana:
          // el filtro por día va sobre la llegada real cuando la hay.
          status: In([
            AppointmentStatus.Requested,
            AppointmentStatus.Confirmed,
            AppointmentStatus.InProgress,
          ]),
          checkedInAt: Between(dayStart, dayEnd),
          ...(membership ? { comercioId: membership.comercioId } : {}),
        },
        order: { checkedInAt: 'ASC', startAt: 'ASC' },
      }),
    ]);

    // Quien se anotó sin elegir servicio no tiene (serviceId null): se estima con la duración
    // por defecto hasta que el profesional se lo asigne.
    const serviceIds = [
      ...new Set(appts.map((a) => a.serviceId).filter((id): id is string => !!id)),
    ];
    const personIds = [...new Set(appts.map((a) => a.personId))];
    const [services, persons, learned] = await Promise.all([
      serviceIds.length ? this.services.find({ where: { id: In(serviceIds) } }) : [],
      personIds.length ? this.persons.findByIds(personIds) : [],
      this.learnedDurations(tenantId, serviceIds),
    ]);
    const serviceById = new Map(services.map((s) => [s.id, s]));
    const personById = new Map(persons.map((p) => [p.id, p]));

    // ETA aprendido: cuánto tarda DE VERDAD este profesional en cada servicio (promedio
    // de sus últimas atenciones). Sin suficientes datos, cae a la duración configurada.
    const duration = (a: Appointment) =>
      (a.serviceId
        ? (learned.get(a.serviceId) ?? serviceById.get(a.serviceId)?.durationMinutes)
        : undefined) ?? AppointmentsService.DEFAULT_WALK_IN_MINUTES;

    const attendance = membership
      ? await this.availability.getWalkInSchedule(membership)
      : EMPTY_ATTENDANCE;

    const now = Date.now();
    // El cursor arranca en "ahora" y avanza con la duración de cada uno. Si hay
    // alguien en atención, el primero de la cola no puede empezar antes de que
    // termine (estimado sobre su inicio real).
    let cursor = now;
    const inProgress = appts.find((a) => a.status === AppointmentStatus.InProgress);
    if (inProgress?.actualStartAt) {
      cursor = Math.max(cursor, inProgress.actualStartAt.getTime() + duration(inProgress) * 60_000);
    }

    const isAway = (a: Appointment) => !!a.awayUntil && a.awayUntil.getTime() > now;

    const toItem = (a: Appointment, position: number, etaMinutes: number): WaitingItemDto => ({
      appointmentId: a.id,
      displayName: this.firstName(personById.get(a.personId)?.fullName),
      ticketNumber: a.ticketNumber ?? 0,
      position,
      etaMinutes,
      status: a.status,
      serviceId: a.serviceId,
      serviceName: (a.serviceId && serviceById.get(a.serviceId)?.name) || NO_SERVICE_LABEL,
      startAt: a.startAt.toISOString(),
      checkedInAt: a.checkedInAt ? a.checkedInAt.toISOString() : null,
      isWalkIn: a.createdVia === CreatedVia.WalkIn,
      isProvisional: a.isProvisional,
      isPriority: a.isPriority,
      calledAt: a.calledAt ? a.calledAt.toISOString() : null,
      callCount: a.callCount,
      awayUntil: isAway(a) && a.awayUntil ? a.awayUntil.toISOString() : null,
      etaLearned: !!a.serviceId && learned.has(a.serviceId),
    });

    // Quien está ausente ("me voy y vuelvo") conserva su lugar pero no cuenta: no suma a
    // la posición de los de atrás ni consume tiempo en el ETA, porque a esa hora no estaría.
    let ahead = 0;
    const queue = appts
      .filter((a) => a.status === AppointmentStatus.Confirmed)
      .sort(byQueueOrder)
      .map((a) => {
        const etaMinutes = Math.max(0, Math.round((cursor - now) / 60_000));
        const item = toItem(a, ahead, etaMinutes);
        if (!isAway(a)) {
          ahead++;
          cursor += duration(a) * 60_000;
        }
        return item;
      });

    return {
      staffId,
      staffName: staff?.displayName ?? 'Profesional',
      membershipId: membership?.id ?? '',
      status: membership?.waitingRoomStatus ?? WaitingRoomStatus.Open,
      note: membership?.waitingRoomNote ?? null,
      selfCheckInEnabled: membership?.waitingRoomSelfCheckIn ?? false,
      selfCheckInAskService: membership?.waitingRoomAskService ?? false,
      selfCheckInAutoAccept: membership?.waitingRoomAutoAccept ?? false,
      selfCheckInOpen:
        !!membership?.waitingRoomEnabled &&
        !!membership.waitingRoomSelfCheckIn &&
        membership.waitingRoomStatus !== WaitingRoomStatus.Closed &&
        // Si el profesional definió franjas por orden de llegada, solo se anota dentro de ellas.
        (!attendance.hasSchedule || attendance.openNow),
      attendance,
      nowServing: inProgress ? toItem(inProgress, 0, 0) : null,
      queue,
      pending: appts
        .filter((a) => a.status === AppointmentStatus.Requested)
        .map((a) => toItem(a, 0, 0)),
      updatedAt: new Date(now).toISOString(),
    };
  }

  /** Mínimo de atenciones terminadas para confiar en el promedio real en vez del configurado. */
  private static readonly MIN_LEARNED_SAMPLES = 3;

  /** Duración que se asume para quien se anotó sin servicio (ETA y fin nominal del turno). */
  private static readonly DEFAULT_WALK_IN_MINUTES = 30;

  /**
   * Duración real promedio (minutos) por servicio de este profesional, sobre sus
   * atenciones de los últimos 90 días. Se descartan las que quedaron "abiertas" horas
   * (se olvidó darle a Terminé: más de 3× la duración configurada) y las de menos de
   * 1 minuto (se tocó Atender y Terminé sin querer), que ensucian el promedio.
   */
  private async learnedDurations(
    professionalId: string,
    serviceIds: string[],
  ): Promise<Map<string, number>> {
    if (serviceIds.length === 0) return new Map();
    const rows: { service_id: string; avg_min: string }[] = await this.appointments.query(
      `SELECT a.service_id, AVG(EXTRACT(EPOCH FROM (a.completed_at - a.actual_start_at)) / 60) AS avg_min
         FROM appointment a
         JOIN service s ON s.id = a.service_id
        WHERE a.professional_id = $1
          AND a.service_id = ANY($2::uuid[])
          AND a.completed_at IS NOT NULL
          AND a.actual_start_at IS NOT NULL
          AND a.completed_at > now() - interval '90 days'
          AND a.completed_at - a.actual_start_at BETWEEN interval '1 minute'
                AND (s.duration_minutes * 3) * interval '1 minute'
        GROUP BY a.service_id
       HAVING COUNT(*) >= $3`,
      [professionalId, serviceIds, AppointmentsService.MIN_LEARNED_SAMPLES],
    );
    return new Map(rows.map((r) => [r.service_id, Math.max(1, Math.round(Number(r.avg_min)))]));
  }

  /** Sala de espera de una membresía (para la pantalla pública del comercio). */
  async computeWaitingRoomForMembership(membership: Membership): Promise<WaitingRoomDto> {
    const staff = await this.staff.findOne({
      where: { professionalId: membership.professionalId },
    });
    if (!staff) throw new NotFoundException('El profesional no tiene agenda configurada');
    return this.computeWaitingRoom(membership.professionalId, staff.id, membership.id);
  }

  /**
   * Marca la llegada: asigna número de turno del día (por agenda) y el token del
   * link personal. Idempotente: si ya hizo check-in, no se le mueve el número.
   */
  private async markArrival(appointment: Appointment): Promise<Appointment> {
    if (appointment.checkedInAt) return appointment;
    const { start: dayStart, end: dayEnd } = await this.todayBounds(appointment.professionalId);

    // MAX+1 solo es correcto si nadie más lo calcula a la vez: dos check-ins
    // simultáneos (o un self check-in coincidiendo con un walk-in) leían el mismo
    // máximo y se llevaban el mismo número. El lock de asesoramiento serializa la
    // asignación por agenda y se libera solo al cerrar la transacción.
    return this.appointments.manager.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        `ticket:${appointment.staffId}`,
      ]);
      const repo = manager.getRepository(Appointment);
      const { max } = await repo
        .createQueryBuilder('a')
        .select('MAX(a.ticket_number)', 'max')
        .where('a.staff_id = :staffId', { staffId: appointment.staffId })
        .andWhere('a.checked_in_at BETWEEN :dayStart AND :dayEnd', { dayStart, dayEnd })
        .getRawOne<{ max: number | null }>()
        .then((r) => r ?? { max: null });

      appointment.checkedInAt = new Date();
      appointment.ticketNumber = (max ?? 0) + 1;
      appointment.queueRank = appointment.checkedInAt.getTime();
      appointment.publicToken ??= randomBytes(16).toString('base64url');
      return repo.save(appointment);
    });
  }

  /**
   * Límites del "hoy" en la zona horaria del profesional. NO se puede usar
   * `setHours` sobre el Date del servidor: en producción (contenedor en UTC) el día
   * cortaría a las 21:00 de Argentina, la fila se vaciaría a esa hora y los
   * números de turno volverían a 1 en plena jornada.
   */
  private async todayBounds(professionalId: string): Promise<{ start: Date; end: Date }> {
    const pro = await this.professionals.findOne({
      where: { id: professionalId },
      select: { id: true, timezone: true },
    });
    const now = DateTime.now().setZone(pro?.timezone || 'America/Argentina/Buenos_Aires');
    return { start: now.startOf('day').toJSDate(), end: now.endOf('day').toJSDate() };
  }

  /** El profesional marca que el cliente de un turno agendado ya llegó. */
  async checkIn(tenantId: string, id: string): Promise<Appointment> {
    const appointment = await this.findById(tenantId, id);
    if ([AppointmentStatus.Done, AppointmentStatus.Cancelled].includes(appointment.status)) {
      throw new BadRequestException('El turno ya está cerrado');
    }
    const saved = await this.markArrival(appointment);
    await this.emitWaitingRoom(tenantId, saved.staffId, saved.comercioId);
    return saved;
  }

  /** Deshace el check-in (se marcó por error): sale de la cola, conserva el turno. */
  async undoCheckIn(tenantId: string, id: string): Promise<Appointment> {
    const appointment = await this.findById(tenantId, id);
    this.resetQueueState(appointment);
    const saved = await this.appointments.save(appointment);
    await this.emitWaitingRoom(tenantId, saved.staffId, saved.comercioId);
    return saved;
  }

  /** Saca a un turno de la fila y limpia todo lo que dependía de estar en ella. */
  private resetQueueState(a: Appointment): void {
    a.checkedInAt = null;
    a.ticketNumber = null;
    a.queueRank = null;
    a.isPriority = false;
    a.calledAt = null;
    a.callCount = 0;
    a.awayUntil = null;
    a.notifiedSecondAt = null;
    a.notifiedNextAt = null;
  }

  /**
   * Cliente que llega sin turno. Crea el turno en el momento (`startAt` = ahora)
   * y lo mete en la cola ya presente. A diferencia de una reserva, NO valida
   * disponibilidad ni solapamiento: el orden lo da la cola, no la grilla.
   *
   * `status`: confirmado si lo carga el profesional; `requested` (pendiente de
   * que lo acepte) si el propio cliente se anotó escaneando el QR.
   */
  async createWalkIn(
    professionalId: string,
    membership: Membership,
    input: {
      staffId: string;
      /** Sin servicio: el cliente solo se anotó; el profesional lo asigna después. */
      serviceId?: string | null;
      personId?: string;
      fullName?: string;
      phone?: string;
      email?: string;
    },
    opts: { needsApproval: boolean; accountId?: string | null },
  ): Promise<Appointment> {
    const service = input.serviceId ? await this.loadService(input.serviceId) : null;
    if (service) {
      if (service.comercioId !== membership.comercioId) {
        throw new NotFoundException('El servicio no pertenece a este comercio');
      }
      if (!(await this.catalog.isAssigned(service.id, membership.id))) {
        throw new NotFoundException('El profesional no ofrece este servicio');
      }
    }

    const personId = await this.resolvePersonId(input, opts.accountId);
    const startAt = new Date();
    const endAt = new Date(
      startAt.getTime() +
        (service?.durationMinutes ?? AppointmentsService.DEFAULT_WALK_IN_MINUTES) * 60_000,
    );

    const appointment = this.appointments.create({
      professionalId,
      comercioId: membership.comercioId,
      membershipId: membership.id,
      staffId: input.staffId,
      personId,
      serviceId: service?.id ?? null,
      startAt,
      endAt,
      status: opts.needsApproval ? AppointmentStatus.Requested : AppointmentStatus.Confirmed,
      isProvisional: false,
      createdVia: CreatedVia.WalkIn,
    });
    const saved = await this.markArrival(await this.appointments.save(appointment));
    await this.ensureProfessionalClient(professionalId, personId);
    await this.emitWaitingRoom(professionalId, saved.staffId, saved.comercioId);
    return saved;
  }

  /**
   * Walk-in cargado por el profesional desde su panel. La membresía sale del
   * comercio del servicio elegido (un profesional puede atender en varios).
   */
  async createWalkInForTenant(
    tenantId: string,
    dto: {
      staffId: string;
      serviceId: string;
      personId?: string;
      fullName?: string;
      phone?: string;
      email?: string;
    },
  ): Promise<Appointment> {
    const service = await this.loadService(dto.serviceId);
    const membership = await this.comercios.getActiveMembership(tenantId, service.comercioId);
    return this.createWalkIn(tenantId, membership, dto, { needsApproval: false });
  }

  /**
   * Asigna (o corrige) el servicio de una entrada de la sala. Es el paso del profesional para
   * quien se anotó sin elegir: define el precio al cobrar y el tiempo estimado de la fila.
   * Solo walk-ins: en un turno con agenda el servicio fija el horario reservado.
   */
  async assignService(tenantId: string, id: string, serviceId: string): Promise<Appointment> {
    const appointment = await this.findById(tenantId, id);
    if (appointment.createdVia !== CreatedVia.WalkIn) {
      throw new BadRequestException('Solo se puede asignar el servicio a entradas de la sala.');
    }
    if (
      appointment.status === AppointmentStatus.Cancelled ||
      appointment.status === AppointmentStatus.NoShow
    ) {
      throw new BadRequestException('Este turno ya está cerrado.');
    }
    const service = await this.loadService(serviceId);
    if (service.comercioId !== appointment.comercioId) {
      throw new NotFoundException('El servicio no pertenece a este comercio');
    }
    if (!(await this.catalog.isAssigned(service.id, appointment.membershipId))) {
      throw new NotFoundException('El profesional no ofrece este servicio');
    }

    appointment.serviceId = service.id;
    appointment.service = service;
    // En un walk-in el fin es nominal (no ocupa grilla): sigue a la duración del servicio.
    appointment.endAt = new Date(appointment.startAt.getTime() + service.durationMinutes * 60_000);
    const saved = await this.appointments.save(appointment);
    await this.emitWaitingRoom(tenantId, saved.staffId, saved.comercioId);
    return saved;
  }

  /**
   * Self check-in público: el cliente se anota escaneando el QR del local. Queda
   * pendiente de aprobación del profesional, así nadie mete gente en la cola sin
   * que él lo vea.
   */
  async selfCheckIn(
    membership: Membership,
    input: { serviceId?: string; fullName: string; phone: string; email?: string },
    accountId?: string | null,
  ): Promise<SelfCheckInResultDto> {
    if (!membership.waitingRoomEnabled || !membership.waitingRoomSelfCheckIn) {
      throw new ForbiddenException('Este local no permite anotarse desde el celular.');
    }
    if (membership.waitingRoomStatus === WaitingRoomStatus.Closed) {
      throw new ForbiddenException('La sala de espera está cerrada en este momento.');
    }

    // Servicio: si el cliente no eligió y el profesional ofrece uno solo, es ese (no hay nada
    // que preguntar). Si pidió que se elija y hay varios, es obligatorio. Si no lo pidió,
    // el cliente solo se anota y el profesional lo completa después.
    let serviceId = input.serviceId;
    if (!serviceId) {
      const offered = await this.catalog.listActiveByMembership(membership.id);
      if (offered.length === 1) serviceId = offered[0].id;
    }
    if (!serviceId && membership.waitingRoomAskService) {
      throw new BadRequestException('Elegí qué venís a hacerte.');
    }

    // Si el profesional define franjas por orden de llegada, solo se puede anotar dentro de ellas
    // (fuera de esas horas se atiende con turno). Sin franjas definidas no hay restricción.
    const attendance = await this.availability.getWalkInSchedule(membership, serviceId);
    if (attendance.hasSchedule && !attendance.openNow) {
      throw new ForbiddenException(
        `Ahora no se atiende por orden de llegada.${describeNextWindow(attendance.nextWindow)}`,
      );
    }
    const staff = await this.staff.findOne({
      where: { professionalId: membership.professionalId },
    });
    if (!staff) throw new NotFoundException('El profesional no tiene agenda configurada');

    const appointment = await this.createWalkIn(
      membership.professionalId,
      membership,
      { ...input, staffId: staff.id, serviceId },
      // Por defecto queda pendiente de que el profesional lo acepte; con "aceptar automáticamente"
      // entra directo a la fila.
      { needsApproval: !membership.waitingRoomAutoAccept, accountId },
    );
    // Avisa al profesional (web push): en una fila con gente, nadie mira la pantalla.
    void this.notifyProfessionalOfSelfCheckIn(
      membership.professionalId,
      input.fullName,
      appointment.status === AppointmentStatus.Requested,
    );
    return {
      token: appointment.publicToken ?? '',
      ticketNumber: appointment.ticketNumber ?? 0,
      needsApproval: appointment.status === AppointmentStatus.Requested,
    };
  }

  private async notifyProfessionalOfSelfCheckIn(
    professionalId: string,
    fullName: string,
    needsApproval: boolean,
  ): Promise<void> {
    try {
      const pro = await this.professionals.findOne({
        where: { id: professionalId },
        select: { id: true, accountId: true },
      });
      if (!pro) return;
      await this.push.sendToAccount(pro.accountId, {
        title: 'Alguien se anotó en la fila',
        body: needsApproval
          ? `${this.firstName(fullName)} se anotó desde su celular. Aceptalo para que entre.`
          : `${this.firstName(fullName)} se anotó desde su celular y ya está en la fila.`,
        url: '/app/sala',
        tag: 'sala-pendiente',
      });
    } catch (err) {
      this.logger.warn(`No se pudo avisar al profesional: ${String(err)}`);
    }
  }

  /** Vista personal del cliente por token opaco (link del QR). Sin auth. */
  async getSpotByToken(token: string): Promise<MyWaitingSpotDto> {
    const appointment = await this.appointments.findOne({ where: { publicToken: token } });
    if (!appointment) throw new NotFoundException('No encontramos tu lugar en la fila');
    const room = await this.computeWaitingRoom(
      appointment.professionalId,
      appointment.staffId,
      appointment.membershipId,
    );
    const me =
      room.nowServing?.appointmentId === appointment.id
        ? room.nowServing
        : ([...room.queue, ...room.pending].find((i) => i.appointmentId === appointment.id) ??
          null);
    return {
      me,
      // La pantalla del cliente no necesita ver quiénes están pendientes de aprobación.
      room: { ...room, pending: [] },
      finished: !me,
      outcome: me ? 'waiting' : this.outcomeOf(appointment),
      pushEnabled: this.push.enabled,
      pushSubscribed: await this.push.hasAppointmentSubscription(appointment.id),
      awaysLeft: Math.max(0, MAX_AWAYS - appointment.awayCount),
    };
  }

  /** Por qué ya no está en la fila: el cliente ve un mensaje distinto en cada caso. */
  private outcomeOf(a: Appointment): MyWaitingSpotDto['outcome'] {
    if (a.status === AppointmentStatus.Done) return 'done';
    if (a.status === AppointmentStatus.NoShow) return 'no_show';
    if (a.status === AppointmentStatus.Cancelled) return 'left';
    return 'not_in_queue';
  }

  // ---- Acciones del profesional sobre la fila ----

  /** Presentes y confirmados de la misma agenda/comercio que `ref`, en el orden real de la cola. */
  private async orderedQueueOf(ref: Appointment): Promise<Appointment[]> {
    const { start, end } = await this.todayBounds(ref.professionalId);
    const rows = await this.appointments.find({
      where: {
        professionalId: ref.professionalId,
        staffId: ref.staffId,
        comercioId: ref.comercioId,
        status: AppointmentStatus.Confirmed,
        checkedInAt: Between(start, end),
      },
    });
    return rows.sort(byQueueOrder);
  }

  /**
   * "Pasá, te toca": el profesional llama a alguien de la fila. Le llega un push (con
   * vibración) y su pantalla pasa a "¡Es tu turno!". Se puede repetir si no responde.
   * No exige que el profesional esté libre: puede ir llamando al siguiente mientras
   * termina con el actual.
   */
  async call(tenantId: string, id: string): Promise<Appointment> {
    const a = await this.findById(tenantId, id);
    if (a.status !== AppointmentStatus.Confirmed || !a.checkedInAt) {
      throw new BadRequestException('Solo se llama a quien está en la fila');
    }
    a.calledAt = new Date();
    a.callCount += 1;
    a.awayUntil = null; // si estaba ausente, el llamado lo da por vuelto
    const saved = await this.appointments.save(a);
    await this.notifier.notifyCalled(saved, await this.staffName(saved.staffId));
    await this.emitWaitingRoom(tenantId, saved.staffId, saved.comercioId);
    return saved;
  }

  /**
   * "No respondió": lo manda al final de la fila en vez de marcarlo como que no vino.
   * Conserva su número de turno y vuelve a recibir los avisos al reacercarse.
   */
  async sendToBack(tenantId: string, id: string): Promise<Appointment> {
    const a = await this.findById(tenantId, id);
    if (a.status !== AppointmentStatus.Confirmed || !a.checkedInAt) {
      throw new BadRequestException('Solo se reordena a quien está en la fila');
    }
    const queue = await this.orderedQueueOf(a);
    const maxRank = Math.max(0, ...queue.map((q) => q.queueRank ?? q.checkedInAt?.getTime() ?? 0));
    a.queueRank = maxRank + 1000;
    a.isPriority = false;
    a.calledAt = null;
    a.awayUntil = null;
    a.notifiedSecondAt = null;
    a.notifiedNextAt = null;
    const saved = await this.appointments.save(a);
    await this.emitWaitingRoom(tenantId, saved.staffId, saved.comercioId);
    return saved;
  }

  /**
   * Sube o baja un lugar en la fila. Reescribe los rangos de toda la cola de forma
   * consecutiva (en vez de intercambiar solo dos): si dos tuvieran el mismo rango un
   * intercambio no cambiaría nada. Solo se mueve dentro del mismo grupo de prioridad;
   * para cruzar ese límite está "Urgente".
   */
  async moveInQueue(tenantId: string, id: string, direction: 'up' | 'down'): Promise<Appointment> {
    const a = await this.findById(tenantId, id);
    const queue = await this.orderedQueueOf(a);
    const idx = queue.findIndex((q) => q.id === a.id);
    if (idx < 0) throw new BadRequestException('Solo se reordena a quien está en la fila');
    const j = direction === 'up' ? idx - 1 : idx + 1;
    if (j < 0 || j >= queue.length) return a;
    if (queue[j].isPriority !== queue[idx].isPriority) {
      throw new BadRequestException('Usá "Urgente" para pasar al frente de la fila');
    }
    [queue[idx], queue[j]] = [queue[j], queue[idx]];
    queue.forEach((q, i) => (q.queueRank = (i + 1) * 1000));
    await this.appointments.save(queue);
    await this.emitWaitingRoom(tenantId, a.staffId, a.comercioId);
    return queue.find((q) => q.id === a.id) ?? a;
  }

  /** Marca/desmarca a alguien como urgente: pasa al frente de la fila. */
  async setPriority(tenantId: string, id: string, priority: boolean): Promise<Appointment> {
    const a = await this.findById(tenantId, id);
    if (a.status !== AppointmentStatus.Confirmed || !a.checkedInAt) {
      throw new BadRequestException('Solo se prioriza a quien está en la fila');
    }
    a.isPriority = priority;
    // Al reordenarse de grupo, que no quede sin avisos por haber estado "primero" antes.
    a.notifiedSecondAt = null;
    a.notifiedNextAt = null;
    const saved = await this.appointments.save(a);
    await this.emitWaitingRoom(tenantId, saved.staffId, saved.comercioId);
    return saved;
  }

  // ---- Acciones del cliente (por el token de su link personal) ----

  private async findByToken(token: string): Promise<Appointment> {
    const a = await this.appointments.findOne({ where: { publicToken: token } });
    if (!a) throw new NotFoundException('No encontramos tu lugar en la fila');
    return a;
  }

  /**
   * "Ya no voy". Si llegó sin turno (o todavía estaba pendiente de aceptación), el turno
   * se anula. Si tenía un turno agendado, solo sale de la fila y el turno se conserva.
   */
  async leaveByToken(token: string): Promise<LeaveResultDto> {
    const a = await this.findByToken(token);
    if (a.status === AppointmentStatus.InProgress) {
      throw new BadRequestException('Ya te están atendiendo');
    }
    if (TERMINAL_STATUSES.includes(a.status)) {
      throw new BadRequestException('Ya no estás en la fila');
    }
    const scheduled =
      a.createdVia !== CreatedVia.WalkIn && a.status === AppointmentStatus.Confirmed;
    if (scheduled) {
      this.resetQueueState(a);
    } else {
      a.status = AppointmentStatus.Cancelled;
      a.cancellationReason = CancellationReason.Client;
    }
    await this.appointments.save(a);
    await this.push.clearAppointment(a.id);
    await this.emitWaitingRoom(a.professionalId, a.staffId, a.comercioId);
    return { keptAppointment: scheduled };
  }

  /**
   * "Me voy y vuelvo": conserva el lugar y el número, pero se lo saltea mientras dura
   * (hasta 15 min) y no cuenta en el ETA de los de atrás. Tope de {@link MAX_AWAYS} veces,
   * para que no sea una forma de dejar el lugar guardado todo el día.
   */
  async setAwayByToken(token: string, minutes = 10): Promise<Appointment> {
    const a = await this.findByToken(token);
    if (a.status !== AppointmentStatus.Confirmed || !a.checkedInAt) {
      throw new BadRequestException('Solo podés ausentarte si estás en la fila');
    }
    if (a.calledAt) throw new BadRequestException('Ya te llamaron: acercate');
    if (a.awayCount >= MAX_AWAYS) {
      throw new BadRequestException(`Ya usaste tus ${MAX_AWAYS} ausencias de hoy`);
    }
    const mins = Math.min(15, Math.max(1, Math.round(minutes)));
    a.awayUntil = new Date(Date.now() + mins * 60_000);
    a.awayCount += 1;
    const saved = await this.appointments.save(a);
    await this.emitWaitingRoom(a.professionalId, a.staffId, a.comercioId);
    // Al vencer la ausencia nada "cambia" en la base, pero las pantallas deben reflejar que
    // volvió a contar. Se re-emite justo después (single-instance; en multi-instancia los
    // clientes igual refrescan por polling como respaldo).
    setTimeout(
      () =>
        void this.emitWaitingRoom(a.professionalId, a.staffId, a.comercioId).catch(() => undefined),
      mins * 60_000 + 1_500,
    ).unref();
    return saved;
  }

  /** "Ya volví": termina la ausencia antes de tiempo. */
  async backByToken(token: string): Promise<Appointment> {
    const a = await this.findByToken(token);
    a.awayUntil = null;
    const saved = await this.appointments.save(a);
    await this.emitWaitingRoom(a.professionalId, a.staffId, a.comercioId);
    return saved;
  }

  async subscribePushByToken(token: string, sub: BrowserSubscription): Promise<void> {
    if (!this.push.enabled) {
      throw new ServiceUnavailableException('Los avisos push no están disponibles');
    }
    const a = await this.findByToken(token);
    if (TERMINAL_STATUSES.includes(a.status)) {
      throw new BadRequestException('Este turno ya terminó');
    }
    await this.push.subscribeAppointment(a.id, sub);
  }

  async unsubscribePushByToken(token: string): Promise<void> {
    const a = await this.findByToken(token);
    await this.push.clearAppointment(a.id);
  }

  // ---- Estadísticas de la sala ----

  /**
   * Resumen de los últimos `days` días de una agenda: cuánto espera la gente, cuánto
   * tarda de verdad una atención, a qué horas llega más gente, qué servicios pesan más.
   * Las horas se agrupan en la zona del profesional, no en la del servidor.
   */
  async getWaitingRoomStats(
    tenantId: string,
    staffId: string,
    days = 30,
  ): Promise<WaitingRoomStatsDto> {
    const range = Math.min(365, Math.max(1, Math.round(days)));
    const pro = await this.professionals.findOne({
      where: { id: tenantId },
      select: { id: true, timezone: true },
    });
    const tz = pro?.timezone || 'America/Argentina/Buenos_Aires';
    const from = DateTime.now()
      .setZone(tz)
      .startOf('day')
      .minus({ days: range - 1 })
      .toJSDate();

    const rows: {
      status: string;
      created_via: string;
      service_id: string;
      hour: number;
      wait_min: string | null;
      service_min: string | null;
    }[] = await this.appointments.query(
      `SELECT a.status, a.created_via, a.service_id,
              EXTRACT(HOUR FROM a.checked_in_at AT TIME ZONE $3::text)::int AS hour,
              EXTRACT(EPOCH FROM (a.actual_start_at - a.checked_in_at)) / 60 AS wait_min,
              EXTRACT(EPOCH FROM (a.completed_at - a.actual_start_at)) / 60 AS service_min
         FROM appointment a
        WHERE a.professional_id = $1 AND a.staff_id = $2 AND a.checked_in_at >= $4`,
      [tenantId, staffId, tz, from],
    );

    const done = rows.filter((r) => (r.status as AppointmentStatus) === AppointmentStatus.Done);
    const waits = done.map((r) => Number(r.wait_min)).filter((n) => Number.isFinite(n) && n >= 0);
    // Una atención "abierta" horas (se olvidó Terminé) distorsiona el promedio.
    const serviceMins = done
      .map((r) => Number(r.service_min))
      .filter((n) => Number.isFinite(n) && n >= 1 && n <= 240);
    const avg = (xs: number[]) =>
      xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0;

    const arrivalsByHour = new Map<number, number>();
    for (const r of rows) arrivalsByHour.set(r.hour, (arrivalsByHour.get(r.hour) ?? 0) + 1);
    const byHour = [...arrivalsByHour.entries()]
      .map(([hour, arrivals]) => ({ hour, arrivals }))
      .sort((a, b) => a.hour - b.hour);
    const peakHours = [...byHour]
      .sort((a, b) => b.arrivals - a.arrivals)
      .slice(0, 3)
      .map((h) => h.hour)
      .sort((a, b) => a - b);

    const serviceIds = [...new Set(done.map((r) => r.service_id))];
    const services = serviceIds.length
      ? await this.services.find({ where: { id: In(serviceIds) } })
      : [];
    const nameById = new Map(services.map((sv) => [sv.id, sv.name]));
    const byService = serviceIds
      .map((sid) => {
        const mine = done.filter((r) => r.service_id === sid);
        const mins = mine
          .map((r) => Number(r.service_min))
          .filter((n) => Number.isFinite(n) && n >= 1 && n <= 240);
        return {
          serviceName: nameById.get(sid) ?? 'Servicio',
          count: mine.length,
          avgServiceMinutes: avg(mins),
        };
      })
      .sort((a, b) => b.count - a.count);

    return {
      days: range,
      servedCount: done.length,
      noShowCount: rows.filter((r) => (r.status as AppointmentStatus) === AppointmentStatus.NoShow)
        .length,
      walkInCount: done.filter((r) => (r.created_via as CreatedVia) === CreatedVia.WalkIn).length,
      avgWaitMinutes: avg(waits),
      maxWaitMinutes: waits.length ? Math.round(Math.max(...waits)) : 0,
      avgServiceMinutes: avg(serviceMins),
      byHour,
      peakHours,
      byService,
    };
  }

  private async emitWaitingRoom(
    tenantId: string,
    staffId: string,
    comercioId?: string,
  ): Promise<void> {
    const membership = comercioId
      ? await this.comercios.getActiveMembership(tenantId, comercioId).catch(() => null)
      : null;
    const room = await this.computeWaitingRoom(tenantId, staffId, membership?.id);
    // La sala del socket es anónima: cualquiera que conozca el staffId (sale en la API
    // pública) puede unirse. Por eso solo viaja la vista pública, SIN `pending` (quién
    // se anotó y espera aprobación). El panel del profesional recarga por REST, que sí
    // está autenticado, al recibir este evento.
    this.waitingRoom.emitRoomUpdate({ staffId, room: { ...room, pending: [] } });
    // Avisos push de avance ("estás segundo"). Nunca debe frenar ni romper la acción que
    // disparó el cambio, por eso va suelto y con su propio manejo de errores.
    void this.notifier
      .notifyProgress(room)
      .catch((err) => this.logger.warn(`Push de avance falló: ${String(err)}`));
  }

  private async staffName(staffId: string): Promise<string> {
    return (await this.staff.findOne({ where: { id: staffId } }))?.displayName ?? 'El profesional';
  }
}
