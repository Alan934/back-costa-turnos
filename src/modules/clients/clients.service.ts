import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppointmentStatus, ProfessionalClientStatus } from '@/common/enums';
import { PersonsService } from '@/modules/identity/persons.service';
import { Appointment } from '@/modules/appointments/entities/appointment.entity';
import { ProfessionalClient } from './entities/professional-client.entity';
import { FichaField } from './entities/ficha-field.entity';
import { ClientNote } from './entities/client-note.entity';
import { EnrichedClientDto } from './dto/enriched-client.dto';
import {
  CreateClientDto,
  CreateClientNoteDto,
  CreateFichaFieldDto,
  UpdateClientFichaDto,
  UpdateFichaFieldDto,
} from './dto/client.dto';

interface VisitStats {
  count: number;
  last: Date | null;
  /** Último turno pasado no cancelado ni ausente, con su servicio y quién atendió. */
  lastAppointment: { startAt: Date; serviceId: string | null; staffId: string } | null;
  /** Próximo turno pendiente. */
  next: Date | null;
}

/** Turnos que no cuentan como "vino" ni como "tiene turno". */
const NOT_ATTENDED = [AppointmentStatus.Cancelled, AppointmentStatus.NoShow];
const PENDING = [
  AppointmentStatus.Requested,
  AppointmentStatus.Confirmed,
  AppointmentStatus.InProgress,
];

@Injectable()
export class ClientsService {
  constructor(
    @InjectRepository(ProfessionalClient)
    private readonly clients: Repository<ProfessionalClient>,
    @InjectRepository(FichaField)
    private readonly fichaFields: Repository<FichaField>,
    @InjectRepository(ClientNote)
    private readonly notes: Repository<ClientNote>,
    @InjectRepository(Appointment)
    private readonly appointments: Repository<Appointment>,
    private readonly persons: PersonsService,
  ) {}

  // ---- Ficha fields ----
  listFichaFields(tenantId: string): Promise<FichaField[]> {
    return this.fichaFields.find({
      where: { professionalId: tenantId },
      order: { displayOrder: 'ASC' },
    });
  }

  createFichaField(tenantId: string, dto: CreateFichaFieldDto): Promise<FichaField> {
    const field = this.fichaFields.create({
      professionalId: tenantId,
      label: dto.label,
      type: dto.type,
      options: dto.options ?? null,
      isRequired: dto.isRequired ?? false,
      isVisibleToClient: dto.isVisibleToClient ?? true,
      displayOrder: dto.displayOrder ?? 0,
    });
    return this.fichaFields.save(field);
  }

  async updateFichaField(
    tenantId: string,
    id: string,
    dto: UpdateFichaFieldDto,
  ): Promise<FichaField> {
    const field = await this.fichaFields.findOne({
      where: { id, professionalId: tenantId },
    });
    if (!field) throw new NotFoundException('Campo de ficha no encontrado');
    Object.assign(field, dto);
    return this.fichaFields.save(field);
  }

  async deleteFichaField(tenantId: string, id: string): Promise<void> {
    const res = await this.fichaFields.delete({ id, professionalId: tenantId });
    if (!res.affected) throw new NotFoundException('Campo de ficha no encontrado');
  }

  private async validateFichaValues(
    tenantId: string,
    values: Record<string, unknown>,
  ): Promise<void> {
    const fields = await this.listFichaFields(tenantId);
    for (const field of fields) {
      if (field.isRequired) {
        const v = values[field.id];
        if (v === undefined || v === null || v === '') {
          throw new BadRequestException(`El campo "${field.label}" es obligatorio`);
        }
      }
    }
  }

  // ---- Clients (membership) ----
  /** Lista de clientes con datos de la persona embebidos. `q` busca por nombre/email/telefono. */
  async listClients(tenantId: string, q?: string): Promise<EnrichedClientDto[]> {
    const qb = this.clients
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.person', 'person')
      .where('c.professional_id = :tenantId', { tenantId })
      // El dueño nunca es cliente de sí mismo: excluir las membresías cuya persona
      // pertenezca a la cuenta del propio profesional (identidad cuenta↔Person es 1:N,
      // por eso filtramos por accountId y no por una sola persona "canónica").
      .andWhere(
        'person.account_id IS DISTINCT FROM (SELECT p.account_id FROM professional p WHERE p.id = :tenantId)',
      )
      .orderBy('c.created_at', 'DESC')
      .addOrderBy('c.id', 'DESC');

    // Búsqueda en la base (antes se traía toda la cartera y se filtraba en memoria). `strpos`
    // en vez de LIKE: el término es literal, sin comodines que escapar.
    const term = q?.trim().toLowerCase();
    if (term) {
      qb.andWhere(
        `(strpos(lower(coalesce(person.full_name, '')), :term) > 0
          OR strpos(lower(coalesce(person.email, '')), :term) > 0
          OR strpos(lower(coalesce(person.phone, '')), :term) > 0)`,
        { term },
      );
    }
    const clients = await qb.getMany();

    // Sin búsqueda es toda la cartera: se agregan los turnos de todo el tenant de una.
    const visits = await this.computeVisits(tenantId, term ? clients.map((c) => c.personId) : null);
    return clients.map((c) => this.toEnriched(c, visits.get(c.personId)));
  }

  /** Detalle de un cliente, enriquecido. */
  async getClientEnriched(tenantId: string, id: string): Promise<EnrichedClientDto> {
    const client = await this.getClient(tenantId, id);
    const visits = await this.computeVisits(tenantId, [client.personId]);
    return this.toEnriched(client, visits.get(client.personId));
  }

  /** Versión interna (entidad cruda con persona) usada por otras operaciones. */
  async getClient(tenantId: string, id: string): Promise<ProfessionalClient> {
    const client = await this.clients.findOne({
      where: { id, professionalId: tenantId },
      relations: { person: true },
    });
    if (!client) throw new NotFoundException('Cliente no encontrado');
    return client;
  }

  /**
   * Por persona: visitas atendidas (done) y la última; el último turno que ya pasó (no
   * cancelado ni ausente, aunque no esté marcado como atendido) y el próximo pendiente.
   *
   * Se agrega en la base, una fila por persona (antes se traían todos los turnos de la cartera
   * y se recorrían en memoria). `personIds = null` = toda la cartera del tenant.
   */
  private async computeVisits(
    tenantId: string,
    personIds: string[] | null,
  ): Promise<Map<string, VisitStats>> {
    const map = new Map<string, VisitStats>();
    const ids = personIds ? [...new Set(personIds)] : null;
    if (ids && ids.length === 0) return map;

    const qb = this.appointments
      .createQueryBuilder('a')
      .select('a.person_id', 'personId')
      .addSelect(`count(*) FILTER (WHERE a.status = :done)`, 'count')
      .addSelect(`max(a.start_at) FILTER (WHERE a.status = :done)`, 'last')
      .addSelect(
        `(array_agg(a.start_at ORDER BY a.start_at DESC, a.id DESC) FILTER (WHERE a.start_at <= :now))[1]`,
        'lastStartAt',
      )
      .addSelect(
        `(array_agg(a.service_id ORDER BY a.start_at DESC, a.id DESC) FILTER (WHERE a.start_at <= :now))[1]`,
        'lastServiceId',
      )
      .addSelect(
        `(array_agg(a.staff_id ORDER BY a.start_at DESC, a.id DESC) FILTER (WHERE a.start_at <= :now))[1]`,
        'lastStaffId',
      )
      .addSelect(
        `min(a.start_at) FILTER (WHERE a.start_at > :now AND a.status IN (:...pending))`,
        'next',
      )
      .where('a.professional_id = :tenantId', { tenantId })
      .andWhere('a.status NOT IN (:...notAttended)')
      .setParameters({
        done: AppointmentStatus.Done,
        now: new Date(),
        pending: PENDING,
        notAttended: NOT_ATTENDED,
      })
      .groupBy('a.person_id');
    if (ids) qb.andWhere('a.person_id IN (:...ids)', { ids });

    const rows = await qb.getRawMany<{
      personId: string;
      count: string;
      last: Date | null;
      lastStartAt: Date | null;
      lastServiceId: string | null;
      lastStaffId: string | null;
      next: Date | null;
    }>();
    for (const r of rows) {
      map.set(r.personId, {
        count: Number(r.count),
        last: r.last,
        lastAppointment: r.lastStartAt
          ? { startAt: r.lastStartAt, serviceId: r.lastServiceId, staffId: r.lastStaffId! }
          : null,
        next: r.next,
      });
    }
    return map;
  }

  private toEnriched(client: ProfessionalClient, visits?: VisitStats): EnrichedClientDto {
    const p = client.person;
    return {
      id: client.id,
      personId: client.personId,
      status: client.status,
      fichaValues: client.fichaValues,
      createdAt: client.createdAt.toISOString(),
      updatedAt: client.updatedAt.toISOString(),
      fullName: p?.fullName ?? '',
      email: p?.email ?? null,
      phone: p?.phone ?? null,
      visitCount: visits?.count ?? 0,
      lastVisitAt: visits?.last ? visits.last.toISOString() : null,
      lastAppointmentAt: visits?.lastAppointment?.startAt.toISOString() ?? null,
      lastServiceId: visits?.lastAppointment?.serviceId ?? null,
      lastStaffId: visits?.lastAppointment?.staffId ?? null,
      nextAppointmentAt: visits?.next ? visits.next.toISOString() : null,
    };
  }

  async createClient(tenantId: string, dto: CreateClientDto): Promise<EnrichedClientDto> {
    const fichaValues = dto.fichaValues ?? {};
    await this.validateFichaValues(tenantId, fichaValues);

    const person = await this.persons.findOrCreate({
      fullName: dto.fullName,
      email: dto.email ?? null,
      phone: dto.phone ?? null,
    });

    const existing = await this.clients.findOne({
      where: { professionalId: tenantId, personId: person.id },
    });
    if (existing) {
      throw new BadRequestException('Esta persona ya es cliente de este profesional');
    }

    const client = this.clients.create({
      professionalId: tenantId,
      personId: person.id,
      fichaValues,
      status: ProfessionalClientStatus.Active,
    });
    const saved = await this.clients.save(client);
    return this.getClientEnriched(tenantId, saved.id);
  }

  async updateClientFicha(
    tenantId: string,
    id: string,
    dto: UpdateClientFichaDto,
  ): Promise<EnrichedClientDto> {
    const client = await this.getClient(tenantId, id);
    await this.validateFichaValues(tenantId, dto.fichaValues);
    client.fichaValues = dto.fichaValues;
    await this.clients.save(client);
    return this.getClientEnriched(tenantId, id);
  }

  async archiveClient(tenantId: string, id: string): Promise<EnrichedClientDto> {
    const client = await this.getClient(tenantId, id);
    client.status = ProfessionalClientStatus.Archived;
    await this.clients.save(client);
    return this.getClientEnriched(tenantId, id);
  }

  async restoreClient(tenantId: string, id: string): Promise<EnrichedClientDto> {
    const client = await this.getClient(tenantId, id);
    client.status = ProfessionalClientStatus.Active;
    await this.clients.save(client);
    return this.getClientEnriched(tenantId, id);
  }

  // ---- Notes (privadas) ----
  async listNotes(tenantId: string, clientId: string): Promise<ClientNote[]> {
    await this.getClient(tenantId, clientId); // valida pertenencia al tenant
    return this.notes.find({
      where: { professionalClientId: clientId },
      order: { createdAt: 'DESC' },
    });
  }

  async addNote(tenantId: string, clientId: string, dto: CreateClientNoteDto): Promise<ClientNote> {
    await this.getClient(tenantId, clientId);
    const note = this.notes.create({
      professionalClientId: clientId,
      authorStaffId: dto.authorStaffId ?? null,
      body: dto.body,
    });
    return this.notes.save(note);
  }
}
