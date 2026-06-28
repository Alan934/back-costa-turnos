import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AppointmentStatus, ProfessionalClientStatus } from '@/common/enums';
import { PersonsService } from '@/modules/identity/persons.service';
import { Appointment } from '@/modules/appointments/entities/appointment.entity';
import { Professional } from '@/modules/professionals/entities/professional.entity';
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
}

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
    @InjectRepository(Professional)
    private readonly professionals: Repository<Professional>,
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
    const all = await this.clients.find({
      where: { professionalId: tenantId },
      relations: { person: true },
      order: { createdAt: 'DESC' },
    });

    // El dueño nunca es cliente de sí mismo: excluir las membresías cuya persona
    // pertenezca a la cuenta del propio profesional (identidad cuenta↔Person es 1:N,
    // por eso filtramos por accountId y no por una sola persona "canónica").
    const professional = await this.professionals.findOne({ where: { id: tenantId } });
    const ownerAccountId = professional?.accountId ?? null;
    const ownPortfolio = ownerAccountId
      ? all.filter((c) => c.person?.accountId !== ownerAccountId)
      : all;

    const term = q?.trim().toLowerCase();
    const filtered = term
      ? ownPortfolio.filter((c) => {
          const p = c.person;
          return [p?.fullName, p?.email, p?.phone]
            .filter(Boolean)
            .some((v) => v!.toLowerCase().includes(term));
        })
      : ownPortfolio;

    const visits = await this.computeVisits(
      tenantId,
      filtered.map((c) => c.personId),
    );
    return filtered.map((c) => this.toEnriched(c, visits.get(c.personId)));
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

  /** visitCount/lastVisitAt por persona, contando turnos atendidos (done) del tenant. */
  private async computeVisits(
    tenantId: string,
    personIds: string[],
  ): Promise<Map<string, VisitStats>> {
    const ids = [...new Set(personIds)];
    const map = new Map<string, VisitStats>();
    if (ids.length === 0) return map;

    const done = await this.appointments.find({
      where: { professionalId: tenantId, personId: In(ids), status: AppointmentStatus.Done },
      select: ['personId', 'startAt'],
    });
    for (const a of done) {
      const cur = map.get(a.personId) ?? { count: 0, last: null };
      cur.count += 1;
      if (!cur.last || a.startAt > cur.last) cur.last = a.startAt;
      map.set(a.personId, cur);
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
