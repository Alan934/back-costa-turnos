import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConsentType } from '@/common/enums';
import { Consent } from './entities/consent.entity';
import { AuditLog } from './entities/audit-log.entity';

export interface AuditInput {
  accountId?: string | null;
  professionalId?: string | null;
  action: string;
  entity?: string | null;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
  ip?: string | null;
}

@Injectable()
export class LegalService {
  constructor(
    @InjectRepository(Consent)
    private readonly consents: Repository<Consent>,
    @InjectRepository(AuditLog)
    private readonly auditLogs: Repository<AuditLog>,
  ) {}

  recordConsent(
    accountId: string,
    type: ConsentType,
    version: string,
    ip?: string | null,
  ): Promise<Consent> {
    const consent = this.consents.create({
      accountId,
      type,
      version,
      acceptedAt: new Date(),
      ip: ip ?? null,
    });
    return this.consents.save(consent);
  }

  listConsents(accountId: string): Promise<Consent[]> {
    return this.consents.find({
      where: { accountId },
      order: { createdAt: 'DESC' },
    });
  }

  /** Escribe una entrada de auditoria (best-effort, no debe romper la operacion). */
  async writeAudit(input: AuditInput): Promise<void> {
    await this.auditLogs.save(
      this.auditLogs.create({
        accountId: input.accountId ?? null,
        professionalId: input.professionalId ?? null,
        action: input.action,
        entity: input.entity ?? null,
        entityId: input.entityId ?? null,
        metadata: input.metadata ?? {},
        ip: input.ip ?? null,
      }),
    );
  }

  listAudit(professionalId: string): Promise<AuditLog[]> {
    return this.auditLogs.find({
      where: { professionalId },
      order: { createdAt: 'DESC' },
      take: 500,
    });
  }
}
