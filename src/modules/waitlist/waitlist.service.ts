import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, LessThanOrEqual, MoreThan, Repository } from 'typeorm';
import {
  MembershipStatus,
  NotificationChannel,
  NotificationType,
  WaitlistStatus,
} from '@/common/enums';
import { Membership } from '@/modules/comercios/entities/membership.entity';
import { Person } from '@/modules/identity/entities/person.entity';
import {
  formatWhen,
  NotificationsService,
} from '@/modules/notifications/notifications.service';
import { Comercio } from '@/modules/comercios/entities/comercio.entity';
import { Professional } from '@/modules/professionals/entities/professional.entity';
import { Service } from '@/modules/catalog/entities/service.entity';
import { WaitlistEntry } from './entities/waitlist-entry.entity';
import { CreateWaitlistDto, WaitlistItemDto } from './dto/waitlist.dto';

/**
 * Instante (UTC) en que empieza el día 'YYYY-MM-DD' en una zona horaria IANA. Se calcula el
 * desfase de la zona a esa fecha con Intl (sin librerías): mediodía UTC cae en el mismo día
 * calendario en cualquier zona de América, así que sirve de referencia estable.
 */
export function zonedDayStart(date: string, timezone: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new BadRequestException('Fecha inválida');
  const utcMidnight = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(utcMidnight.getTime())) throw new BadRequestException('Fecha inválida');
  const offsetMs = (tz: string): number => {
    const ref = new Date(utcMidnight.getTime() + 12 * 3_600_000);
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).formatToParts(ref);
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
    const asUtc = Date.UTC(
      get('year'),
      get('month') - 1,
      get('day'),
      get('hour'),
      get('minute'),
      get('second'),
    );
    return asUtc - ref.getTime(); // cuánto adelanta (o atrasa) la zona respecto de UTC
  };
  let offset: number;
  try {
    offset = offsetMs(timezone);
  } catch {
    offset = offsetMs('America/Argentina/Buenos_Aires'); // zona inválida guardada en el perfil
  }
  return new Date(utcMidnight.getTime() - offset);
}

@Injectable()
export class WaitlistService {
  private readonly logger = new Logger(WaitlistService.name);

  constructor(
    @InjectRepository(WaitlistEntry)
    private readonly entries: Repository<WaitlistEntry>,
    private readonly notifications: NotificationsService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Lista de espera vigente del profesional: quienes esperan (o ya fueron avisados) para un día
   * que todavía no terminó, con nombre/contacto y servicio para poder llamarlos o darles turno.
   * Ordenada por día y, dentro del día, por orden de llegada.
   */
  async list(tenantId: string): Promise<WaitlistItemDto[]> {
    const entries = await this.entries.find({
      where: {
        professionalId: tenantId,
        status: In([WaitlistStatus.Waiting, WaitlistStatus.Notified]),
        desiredTo: MoreThan(new Date()),
      },
      relations: { person: true, service: true },
      order: { desiredFrom: 'ASC', createdAt: 'ASC' },
    });
    return entries.map((e) => ({
      id: e.id,
      status: e.status,
      desiredFrom: e.desiredFrom.toISOString(),
      desiredTo: e.desiredTo.toISOString(),
      createdAt: e.createdAt.toISOString(),
      personId: e.personId,
      fullName: e.person?.fullName ?? 'Cliente',
      phone: e.person?.phone ?? null,
      email: e.person?.email ?? null,
      serviceId: e.serviceId,
      serviceName: e.service?.name ?? null,
    }));
  }

  /**
   * La persona consiguió turno (lo reservó ella o se lo cargó el profesional): sus entradas
   * para ese día dejan de estar "esperando". Nunca lanza.
   */
  async markBooked(input: { professionalId: string; personId: string; startAt: Date }) {
    try {
      await this.entries.update(
        {
          professionalId: input.professionalId,
          personId: input.personId,
          status: In([WaitlistStatus.Waiting, WaitlistStatus.Notified]),
          desiredFrom: LessThanOrEqual(input.startAt),
          desiredTo: MoreThan(input.startAt),
        },
        { status: WaitlistStatus.Converted },
      );
    } catch (err) {
      this.logger.warn(`Lista de espera: no se pudo marcar como reservada: ${String(err)}`);
    }
  }

  create(tenantId: string, dto: CreateWaitlistDto): Promise<WaitlistEntry> {
    const entry = this.entries.create({
      professionalId: tenantId,
      personId: dto.personId,
      staffId: dto.staffId ?? null,
      serviceId: dto.serviceId ?? null,
      desiredFrom: new Date(dto.desiredFrom),
      desiredTo: new Date(dto.desiredTo),
      status: WaitlistStatus.Waiting,
    });
    return this.entries.save(entry);
  }

  // ---- Lista de espera desde la página pública (la anota el propio cliente) ----

  /**
   * Anota a una persona para un DÍA concreto con uno o varios profesionales (varios = eligió
   * "cualquiera"). Idempotente: si ya estaba esperando ese día/servicio/profesional, no duplica.
   */
  async joinPublic(input: {
    personId: string;
    professionalIds: string[];
    serviceId: string;
    /** 'YYYY-MM-DD' en la zona horaria del comercio. */
    date: string;
    timezone: string;
  }): Promise<void> {
    const desiredFrom = zonedDayStart(input.date, input.timezone);
    const desiredTo = new Date(desiredFrom.getTime() + 24 * 3_600_000);
    if (desiredTo.getTime() < Date.now()) {
      throw new BadRequestException('Ese día ya pasó');
    }
    for (const professionalId of new Set(input.professionalIds)) {
      const existing = await this.entries.findOne({
        where: {
          professionalId,
          personId: input.personId,
          serviceId: input.serviceId,
          desiredFrom,
          status: WaitlistStatus.Waiting,
        },
      });
      if (existing) continue;
      await this.entries.save(
        this.entries.create({
          professionalId,
          personId: input.personId,
          staffId: null,
          serviceId: input.serviceId,
          desiredFrom,
          desiredTo,
          status: WaitlistStatus.Waiting,
        }),
      );
    }
  }

  /**
   * Se liberó un horario (cancelación o reprogramación): avisa por email a quienes esperaban
   * ese día con ese profesional (y ese servicio, si lo indicaron), con el link para reservar.
   * No reserva el lugar para nadie: el primero que entra se lo queda.
   *
   * Nunca lanza: un aviso fallido no debe romper la cancelación que lo disparó.
   */
  async notifyFreedSlot(slot: {
    professionalId: string;
    comercioId: string;
    membershipId: string;
    serviceId: string | null;
    startAt: Date;
    /** Quien liberó el turno: no se le avisa de su propio hueco. */
    excludePersonId?: string | null;
  }): Promise<void> {
    try {
      if (slot.startAt.getTime() <= Date.now()) return; // un horario pasado no le sirve a nadie

      const waiting = await this.entries.find({
        where: {
          professionalId: slot.professionalId,
          status: WaitlistStatus.Waiting,
          desiredFrom: LessThanOrEqual(slot.startAt),
          desiredTo: MoreThan(slot.startAt),
        },
        order: { createdAt: 'ASC' },
      });
      const targets = waiting.filter(
        (e) =>
          e.personId !== slot.excludePersonId &&
          (!e.serviceId || !slot.serviceId || e.serviceId === slot.serviceId),
      );
      if (targets.length === 0) return;

      const [comercio, professional] = await Promise.all([
        this.dataSource.getRepository(Comercio).findOne({ where: { id: slot.comercioId } }),
        this.dataSource.getRepository(Professional).findOne({ where: { id: slot.professionalId } }),
      ]);
      const pageSlug = comercio?.slug ?? professional?.slug;
      const timezone =
        comercio?.timezone ?? professional?.timezone ?? 'America/Argentina/Buenos_Aires';

      const notified = new Set<string>();
      for (const entry of targets) {
        entry.status = WaitlistStatus.Notified;
        await this.entries.save(entry);
        if (notified.has(entry.personId)) continue; // una persona, un mail por hueco
        notified.add(entry.personId);

        const serviceId = entry.serviceId ?? slot.serviceId;
        const service = serviceId
          ? await this.dataSource.getRepository(Service).findOne({ where: { id: serviceId } })
          : null;
        await this.notifications.enqueue({
          professionalId: slot.professionalId,
          personId: entry.personId,
          channel: NotificationChannel.Email,
          type: NotificationType.Waitlist,
          payload: {
            waitlistEntryId: entry.id,
            whenText: formatWhen(slot.startAt, timezone),
            placeName: comercio?.name ?? professional?.businessName ?? null,
            serviceName: service?.name ?? null,
            bookPath: pageSlug
              ? `/r/${pageSlug}` +
                (serviceId ? `?servicio=${serviceId}&pro=${slot.membershipId}` : '')
              : null,
          },
        });
      }
    } catch (err) {
      this.logger.warn(`Lista de espera: no se pudo avisar del horario liberado: ${String(err)}`);
    }
  }

  private async findById(tenantId: string, id: string): Promise<WaitlistEntry> {
    const entry = await this.entries.findOne({
      where: { id, professionalId: tenantId },
    });
    if (!entry) throw new NotFoundException('Entrada de lista de espera no encontrada');
    return entry;
  }

  /**
   * El profesional avisa a mano que hay lugar ese día (por ejemplo, se le liberó un hueco que
   * no pasó por una cancelación del sistema). Le llega el mismo email que el aviso automático,
   * con el link a su página para reservar.
   */
  async notify(tenantId: string, id: string): Promise<WaitlistEntry> {
    const entry = await this.findById(tenantId, id);
    const person = await this.dataSource
      .getRepository(Person)
      .findOne({ where: { id: entry.personId } });
    if (!person?.email) {
      throw new BadRequestException(
        'Esta persona no dejó email: avisale por teléfono o WhatsApp.',
      );
    }
    entry.status = WaitlistStatus.Notified;
    const saved = await this.entries.save(entry);

    const professional = await this.dataSource
      .getRepository(Professional)
      .findOne({ where: { id: tenantId } });
    // Página donde reservar: la del comercio propio si lo tiene, si no la primera activa.
    const membership = await this.dataSource
      .getRepository(Membership)
      .createQueryBuilder('m')
      .innerJoinAndSelect('m.comercio', 'c')
      .where('m.professional_id = :tenantId', { tenantId })
      .andWhere('m.status = :active', { active: MembershipStatus.Active })
      .orderBy('c.is_personal', 'DESC')
      .addOrderBy('m.created_at', 'ASC')
      .getOne();
    const comercio = membership?.comercio;
    const timezone =
      comercio?.timezone ?? professional?.timezone ?? 'America/Argentina/Buenos_Aires';
    const service = entry.serviceId
      ? await this.dataSource.getRepository(Service).findOne({ where: { id: entry.serviceId } })
      : null;
    const dayText = new Intl.DateTimeFormat('es-AR', {
      timeZone: timezone,
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }).format(entry.desiredFrom);

    await this.notifications.enqueue({
      professionalId: tenantId,
      personId: entry.personId,
      channel: NotificationChannel.Email,
      type: NotificationType.Waitlist,
      payload: {
        waitlistEntryId: entry.id,
        whenText: dayText,
        placeName: comercio?.name ?? professional?.businessName ?? null,
        serviceName: service?.name ?? null,
        bookPath: comercio?.slug
          ? `/r/${comercio.slug}` +
            (entry.serviceId && membership
              ? `?servicio=${entry.serviceId}&pro=${membership.id}`
              : '')
          : null,
      },
    });
    return saved;
  }

  async convert(tenantId: string, id: string): Promise<WaitlistEntry> {
    const entry = await this.findById(tenantId, id);
    entry.status = WaitlistStatus.Converted;
    return this.entries.save(entry);
  }

  async remove(tenantId: string, id: string): Promise<void> {
    const res = await this.entries.delete({ id, professionalId: tenantId });
    if (!res.affected) throw new NotFoundException('Entrada no encontrada');
  }
}
