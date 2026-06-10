import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProfessionalClientStatus } from '@/common/enums';
import { PersonsService } from '@/modules/identity/persons.service';
import { ProfessionalClient } from './entities/professional-client.entity';
import { FichaField } from './entities/ficha-field.entity';
import { ClientNote } from './entities/client-note.entity';
import {
  CreateClientDto,
  CreateClientNoteDto,
  CreateFichaFieldDto,
  UpdateClientFichaDto,
  UpdateFichaFieldDto,
} from './dto/client.dto';

@Injectable()
export class ClientsService {
  constructor(
    @InjectRepository(ProfessionalClient)
    private readonly clients: Repository<ProfessionalClient>,
    @InjectRepository(FichaField)
    private readonly fichaFields: Repository<FichaField>,
    @InjectRepository(ClientNote)
    private readonly notes: Repository<ClientNote>,
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
  listClients(tenantId: string): Promise<ProfessionalClient[]> {
    return this.clients.find({
      where: { professionalId: tenantId },
      relations: { person: true },
      order: { createdAt: 'DESC' },
    });
  }

  async getClient(tenantId: string, id: string): Promise<ProfessionalClient> {
    const client = await this.clients.findOne({
      where: { id, professionalId: tenantId },
      relations: { person: true },
    });
    if (!client) throw new NotFoundException('Cliente no encontrado');
    return client;
  }

  async createClient(tenantId: string, dto: CreateClientDto): Promise<ProfessionalClient> {
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
    return this.clients.save(client);
  }

  async updateClientFicha(
    tenantId: string,
    id: string,
    dto: UpdateClientFichaDto,
  ): Promise<ProfessionalClient> {
    const client = await this.getClient(tenantId, id);
    await this.validateFichaValues(tenantId, dto.fichaValues);
    client.fichaValues = dto.fichaValues;
    return this.clients.save(client);
  }

  async archiveClient(tenantId: string, id: string): Promise<ProfessionalClient> {
    const client = await this.getClient(tenantId, id);
    client.status = ProfessionalClientStatus.Archived;
    return this.clients.save(client);
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
