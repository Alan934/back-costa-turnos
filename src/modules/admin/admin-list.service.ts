import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, In, Repository } from 'typeorm';
import { PaginationQueryDto, resolvePagination } from '@/common/dto/paginated.dto';
import { ProfessionalClient } from '@/modules/clients/entities/professional-client.entity';
import { Professional } from '@/modules/professionals/entities/professional.entity';
import { Comercio } from '@/modules/comercios/entities/comercio.entity';
import { Account } from '@/modules/identity/entities/account.entity';
import { Membership } from '@/modules/comercios/entities/membership.entity';
import { Subscription } from '@/modules/subscriptions/entities/subscription.entity';
import {
  AdminClientDto,
  AdminClientPageDto,
  AdminComercioDto,
  AdminComercioPageDto,
  AdminProfessionalDto,
  AdminProfessionalPageDto,
} from './dto/admin-list.dto';

/**
 * Listados GLOBALES para el admin (todos los tenants), paginados, con busqueda
 * libre e INCLUYENDO los registros eliminados (soft-delete) para poder mostrarlos
 * marcados y restaurarlos. `deletedAt` no-null = eliminado.
 */
@Injectable()
export class AdminListService {
  constructor(
    @InjectRepository(ProfessionalClient)
    private readonly clients: Repository<ProfessionalClient>,
    @InjectRepository(Professional)
    private readonly professionals: Repository<Professional>,
    @InjectRepository(Comercio)
    private readonly comercios: Repository<Comercio>,
    @InjectRepository(Account)
    private readonly accounts: Repository<Account>,
    @InjectRepository(Membership)
    private readonly memberships: Repository<Membership>,
    @InjectRepository(Subscription)
    private readonly subscriptions: Repository<Subscription>,
  ) {}

  // ---- Clientes (global) ----
  async listClients(query: PaginationQueryDto): Promise<AdminClientPageDto> {
    const { page, pageSize, skip, take } = resolvePagination(query);
    const term = query.q?.trim();

    const qb = this.clients
      .createQueryBuilder('pc')
      .withDeleted()
      .innerJoinAndSelect('pc.person', 'person')
      .innerJoinAndSelect('pc.professional', 'professional')
      .orderBy('pc.createdAt', 'DESC')
      .skip(skip)
      .take(take);

    if (term) {
      qb.andWhere(
        new Brackets((w) => {
          w.where('person.full_name ILIKE :t', { t: `%${term}%` })
            .orWhere('person.email ILIKE :t', { t: `%${term}%` })
            .orWhere('person.phone ILIKE :t', { t: `%${term}%` });
        }),
      );
    }

    const [rows, total] = await qb.getManyAndCount();
    const items: AdminClientDto[] = rows.map((pc) => ({
      id: pc.id,
      personId: pc.personId,
      professionalId: pc.professionalId,
      professionalName: pc.professional?.businessName ?? '',
      status: pc.status,
      fullName: pc.person?.fullName ?? '',
      email: pc.person?.email ?? null,
      phone: pc.person?.phone ?? null,
      createdAt: pc.createdAt.toISOString(),
      deletedAt: pc.deletedAt ? pc.deletedAt.toISOString() : null,
    }));
    return { items, total, page, pageSize };
  }

  // ---- Comercios (global) ----
  async listComercios(query: PaginationQueryDto): Promise<AdminComercioPageDto> {
    const { page, pageSize, skip, take } = resolvePagination(query);
    const term = query.q?.trim();

    const qb = this.comercios
      .createQueryBuilder('c')
      .withDeleted()
      .orderBy('c.createdAt', 'DESC')
      .skip(skip)
      .take(take);

    if (term) {
      qb.andWhere(
        new Brackets((w) => {
          w.where('c.name ILIKE :t', { t: `%${term}%` }).orWhere('c.slug ILIKE :t', {
            t: `%${term}%`,
          });
        }),
      );
    }

    const [rows, total] = await qb.getManyAndCount();

    // Email de la cuenta dueña + recuento de membresias activas, en bloque.
    const accountIds = [...new Set(rows.map((c) => c.accountId).filter((x): x is string => !!x))];
    const comercioIds = rows.map((c) => c.id);

    const accounts = accountIds.length
      ? await this.accounts.find({ where: { id: In(accountIds) }, withDeleted: true })
      : [];
    const emailByAccount = new Map(accounts.map((a) => [a.id, a.email]));

    const memberCounts = new Map<string, number>();
    if (comercioIds.length) {
      const raw = await this.memberships
        .createQueryBuilder('m')
        .select('m.comercio_id', 'comercioId')
        .addSelect('COUNT(*)', 'count')
        .where('m.comercio_id IN (:...ids)', { ids: comercioIds })
        .groupBy('m.comercio_id')
        .getRawMany<{ comercioId: string; count: string }>();
      for (const r of raw) memberCounts.set(r.comercioId, parseInt(r.count, 10));
    }

    const items: AdminComercioDto[] = rows.map((comercio) => ({
      comercio,
      ownerEmail: comercio.accountId ? (emailByAccount.get(comercio.accountId) ?? null) : null,
      activeMembers: memberCounts.get(comercio.id) ?? 0,
    }));
    return { items, total, page, pageSize };
  }

  // ---- Profesionales (global, paginado) ----
  async listProfessionals(query: PaginationQueryDto): Promise<AdminProfessionalPageDto> {
    const { page, pageSize, skip, take } = resolvePagination(query);
    const term = query.q?.trim();

    const qb = this.professionals
      .createQueryBuilder('p')
      .withDeleted()
      .orderBy('p.createdAt', 'DESC')
      .skip(skip)
      .take(take);

    if (term) {
      qb.andWhere(
        new Brackets((w) => {
          w.where('p.business_name ILIKE :t', { t: `%${term}%` }).orWhere('p.slug ILIKE :t', {
            t: `%${term}%`,
          });
        }),
      );
    }

    const [rows, total] = await qb.getManyAndCount();

    const proIds = rows.map((p) => p.id);
    const subs = proIds.length
      ? await this.subscriptions.find({ where: { professionalId: In(proIds) } })
      : [];
    const byPro = new Map(subs.map((s) => [s.professionalId, s]));

    const items: AdminProfessionalDto[] = rows.map((professional) => ({
      professional,
      subscription: byPro.get(professional.id) ?? null,
    }));
    return { items, total, page, pageSize };
  }
}
