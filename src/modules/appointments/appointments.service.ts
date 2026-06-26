import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
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
import { QueueUpdatePayload, WaitingRoomGateway } from './waiting-room.gateway';

// Estados que ocupan un horario.
const ACTIVE_STATUSES = [
  AppointmentStatus.Requested,
  AppointmentStatus.Confirmed,
  AppointmentStatus.InProgress,
];

// Métodos de cobro fuera del sistema (efectivo, transferencia/QR): precio base sin IVA,
// turno fijo, el profesional confirma el cobro en persona (cierre de caja).
const OFF_SYSTEM_METHODS = [PaymentMethod.Cash, PaymentMethod.Transfer];

/** Minutos que un horario queda reservado (hold) mientras se paga con MercadoPago. */
const HOLD_TTL_MINUTES = 15;

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
  ) {}

  /** Se registra como confirmador para que el webhook de pagos cree el turno. */
  onModuleInit(): void {
    this.paymentsService.registerAppointmentConfirmer(this);
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
    const serviceIds = [...new Set(appts.map((a) => a.serviceId))];
    const personIds = [...new Set(appts.map((a) => a.personId))];
    const [services, persons] = await Promise.all([
      this.services.find({ where: { id: In(serviceIds) } }),
      this.persons.findByIds(personIds),
    ]);
    const serviceNameById = new Map(services.map((s) => [s.id, s.name]));
    const personById = new Map(persons.map((p) => [p.id, p]));

    for (const a of appts) {
      a.serviceName = serviceNameById.get(a.serviceId) ?? 'Servicio';
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
