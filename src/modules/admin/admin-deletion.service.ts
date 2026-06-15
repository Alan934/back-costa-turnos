import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager, In, IsNull, Not } from 'typeorm';
import { AccountStatus } from '@/common/enums';
import { LegalService } from '@/modules/legal/legal.service';
import { Account } from '@/modules/identity/entities/account.entity';
import { Person } from '@/modules/identity/entities/person.entity';
import { Professional } from '@/modules/professionals/entities/professional.entity';
import { Staff } from '@/modules/professionals/entities/staff.entity';
import { Comercio } from '@/modules/comercios/entities/comercio.entity';
import { Membership } from '@/modules/comercios/entities/membership.entity';
import { Service } from '@/modules/catalog/entities/service.entity';
import { ScheduleRule } from '@/modules/availability/entities/schedule-rule.entity';
import { ProfessionalClient } from '@/modules/clients/entities/professional-client.entity';
import { ClientNote } from '@/modules/clients/entities/client-note.entity';

/**
 * Borrado / restauracion LOGICA de los actores de la plataforma (solo admin).
 *
 * Filosofia:
 *  - Soft-delete (deleted_at) en cascada controlada sobre las entidades "propias"
 *    del actor; nunca toca el historial legal/contable (appointment, payment,
 *    subscription, audit_log) que se conserva siempre.
 *  - Ademas del soft-delete, corta el acceso: bloquea la Account asociada y le
 *    limpia el refresh token (revoca la sesion).
 *  - Cada accion queda registrada en audit_log via LegalService.
 */
@Injectable()
export class AdminDeletionService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly legal: LegalService,
  ) {}

  // ---- Professional (tenant / trabajador) ----

  /** Soft-borra un professional y sus entidades propias; bloquea su cuenta. */
  async deleteProfessional(id: string, adminAccountId: string, ip?: string | null): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const professional = await manager.findOne(Professional, { where: { id } });
      if (!professional) throw new NotFoundException('Professional no encontrado');

      // Dependencias propias (agenda/configuracion), no el historial de turnos/pagos.
      // schedule_rule no tiene professional_id: cuelga del staff (staff_id).
      const staffRows = await manager.find(Staff, { where: { professionalId: id } });
      const staffIds = staffRows.map((s) => s.id);
      if (staffIds.length) {
        await this.softRemoveBy(manager, ScheduleRule, { staffId: In(staffIds) });
      }
      await this.softRemoveBy(manager, Membership, { professionalId: id });
      await this.softRemoveBy(manager, Service, { professionalId: id });
      await this.softRemoveBy(manager, ProfessionalClient, { professionalId: id });
      if (staffRows.length) await manager.softRemove(staffRows);
      await manager.softRemove(professional);

      await this.revokeAccount(manager, professional.accountId);

      await this.legal.writeAudit({
        accountId: adminAccountId,
        professionalId: id,
        action: 'admin.professional.delete',
        entity: 'professional',
        entityId: id,
        ip,
      });
    });
  }

  /** Restaura un professional soft-borrado y sus dependencias; reactiva su cuenta. */
  async restoreProfessional(id: string, adminAccountId: string, ip?: string | null): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const professional = await manager.findOne(Professional, {
        where: { id },
        withDeleted: true,
      });
      if (!professional) throw new NotFoundException('Professional no encontrado');

      await manager.recover(professional);
      const staffRows = await manager.find(Staff, {
        where: { professionalId: id },
        withDeleted: true,
      });
      const staffIds = staffRows.map((s) => s.id);
      if (staffIds.length) {
        await this.restoreBy(manager, ScheduleRule, { staffId: In(staffIds) });
      }
      await this.restoreBy(manager, Membership, { professionalId: id });
      await this.restoreBy(manager, Service, { professionalId: id });
      await this.restoreBy(manager, ProfessionalClient, { professionalId: id });
      await this.restoreBy(manager, Staff, { professionalId: id });

      await this.reactivateAccount(manager, professional.accountId);

      await this.legal.writeAudit({
        accountId: adminAccountId,
        professionalId: id,
        action: 'admin.professional.restore',
        entity: 'professional',
        entityId: id,
        ip,
      });
    });
  }

  // ---- Comercio (comercial) ----

  /** Soft-borra un comercio y sus membresias; bloquea la cuenta comercial dueña. */
  async deleteComercio(id: string, adminAccountId: string, ip?: string | null): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const comercio = await manager.findOne(Comercio, { where: { id } });
      if (!comercio) throw new NotFoundException('Comercio no encontrado');

      await this.softRemoveBy(manager, Membership, { comercioId: id });
      await manager.softRemove(comercio);

      // El comercio puede ser "de uno" (accountId NULL): no hay cuenta que bloquear.
      await this.revokeAccount(manager, comercio.accountId);

      await this.legal.writeAudit({
        accountId: adminAccountId,
        action: 'admin.comercio.delete',
        entity: 'comercio',
        entityId: id,
        ip,
      });
    });
  }

  /** Restaura un comercio soft-borrado y sus membresias; reactiva la cuenta dueña. */
  async restoreComercio(id: string, adminAccountId: string, ip?: string | null): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const comercio = await manager.findOne(Comercio, { where: { id }, withDeleted: true });
      if (!comercio) throw new NotFoundException('Comercio no encontrado');

      await manager.recover(comercio);
      await this.restoreBy(manager, Membership, { comercioId: id });
      await this.reactivateAccount(manager, comercio.accountId);

      await this.legal.writeAudit({
        accountId: adminAccountId,
        action: 'admin.comercio.restore',
        entity: 'comercio',
        entityId: id,
        ip,
      });
    });
  }

  // ---- Cliente (ProfessionalClient + Person global) ----

  /**
   * Soft-borra el vinculo cliente-profesional. Si a la persona no le queda ningun
   * otro vinculo activo, tambien se soft-borra la Person global (y se bloquea su
   * cuenta si tiene una). Si le quedan vinculos, solo se borra este.
   */
  async deleteClient(id: string, adminAccountId: string, ip?: string | null): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const client = await manager.findOne(ProfessionalClient, { where: { id } });
      if (!client) throw new NotFoundException('Cliente no encontrado');

      await this.softRemoveBy(manager, ClientNote, { professionalClientId: id });
      await manager.softRemove(client);

      const remaining = await manager.count(ProfessionalClient, {
        where: { personId: client.personId, id: Not(id) },
      });
      if (remaining === 0) {
        const person = await manager.findOne(Person, { where: { id: client.personId } });
        if (person) {
          await manager.softRemove(person);
          await this.revokeAccount(manager, person.accountId);
        }
      }

      await this.legal.writeAudit({
        accountId: adminAccountId,
        professionalId: client.professionalId,
        action: 'admin.client.delete',
        entity: 'professional_client',
        entityId: id,
        metadata: { personId: client.personId, personDeleted: remaining === 0 },
        ip,
      });
    });
  }

  /** Restaura el vinculo cliente-profesional (y la Person si estaba borrada). */
  async restoreClient(id: string, adminAccountId: string, ip?: string | null): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const client = await manager.findOne(ProfessionalClient, {
        where: { id },
        withDeleted: true,
      });
      if (!client) throw new NotFoundException('Cliente no encontrado');

      await manager.recover(client);
      await this.restoreBy(manager, ClientNote, { professionalClientId: id });

      const person = await manager.findOne(Person, {
        where: { id: client.personId },
        withDeleted: true,
      });
      if (person?.deletedAt) {
        await manager.recover(person);
        await this.reactivateAccount(manager, person.accountId);
      }

      await this.legal.writeAudit({
        accountId: adminAccountId,
        professionalId: client.professionalId,
        action: 'admin.client.restore',
        entity: 'professional_client',
        entityId: id,
        ip,
      });
    });
  }

  // ---- Helpers ----

  /** Soft-borra todas las filas de `entity` que matcheen `where` (solo las activas). */
  private async softRemoveBy<T extends object>(
    manager: EntityManager,
    entity: new () => T,
    where: Record<string, unknown>,
  ): Promise<void> {
    const rows = await manager.find(entity, { where: where as object });
    if (rows.length) await manager.softRemove(rows);
  }

  /** Restaura (recover) todas las filas borradas de `entity` que matcheen `where`. */
  private async restoreBy<T extends object>(
    manager: EntityManager,
    entity: new () => T,
    where: Record<string, unknown>,
  ): Promise<void> {
    const rows = await manager.find(entity, {
      where: { ...where, deletedAt: Not(IsNull()) } as object,
      withDeleted: true,
    });
    if (rows.length) await manager.recover(rows);
  }

  /** Bloquea la cuenta y revoca su sesion (refresh token). NULL = nada que hacer. */
  private async revokeAccount(manager: EntityManager, accountId: string | null): Promise<void> {
    if (!accountId) return;
    await manager.update(
      Account,
      { id: accountId },
      { status: AccountStatus.Blocked, refreshTokenHash: null },
    );
  }

  /** Reactiva una cuenta previamente bloqueada por un borrado. */
  private async reactivateAccount(manager: EntityManager, accountId: string | null): Promise<void> {
    if (!accountId) return;
    await manager.update(Account, { id: accountId }, { status: AccountStatus.Active });
  }
}
