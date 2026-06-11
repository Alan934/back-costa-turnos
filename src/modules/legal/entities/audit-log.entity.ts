import { Column, Entity, Index } from 'typeorm';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BaseCreatedEntity } from '@/common/base.entity';

/**
 * Registro de auditoria de acciones sensibles.
 * Append-only; no usa FKs duras para no bloquear borrados.
 */
@Entity('audit_log')
@Index('idx_audit_account', ['accountId'])
@Index('idx_audit_tenant', ['professionalId'])
@Index('idx_audit_entity', ['entity', 'entityId'])
export class AuditLog extends BaseCreatedEntity {
  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @Column({ name: 'account_id', type: 'uuid', nullable: true })
  accountId!: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @Column({ name: 'professional_id', type: 'uuid', nullable: true })
  professionalId!: string | null;

  /** ej. appointment.cancel */
  @ApiProperty()
  @Column({ type: 'text' })
  action!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  @Column({ type: 'text', nullable: true })
  entity!: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @Column({ name: 'entity_id', type: 'uuid', nullable: true })
  entityId!: string | null;

  @ApiProperty({ type: 'object', additionalProperties: true })
  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  metadata!: Record<string, unknown>;

  @ApiPropertyOptional({ type: String, nullable: true })
  @Column({ type: 'inet', nullable: true })
  ip!: string | null;
}
