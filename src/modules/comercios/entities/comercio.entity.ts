import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BaseEntity } from '@/common/base.entity';
import { Account } from '@/modules/identity/entities/account.entity';

export interface ComercioPublicPageSettings {
  logoFileId?: string;
  primaryColor?: string;
  description?: string;
  [key: string]: unknown;
}

/**
 * Comercio / equipo: el lugar de trabajo con su ubicacion, pagina publica y
 * roster de profesionales (membresias). Lo gestiona un rol "comercial".
 * Un profesional que trabaja solo tiene un comercio-de-uno (isPersonal = true).
 */
@Entity('comercio')
export class Comercio extends BaseEntity {
  /** Cuenta del comercial dueño. NULL en un comercio-de-uno (lo "posee" el profesional). */
  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @Column({ name: 'account_id', type: 'uuid', nullable: true })
  accountId!: string | null;

  @ManyToOne(() => Account, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'account_id' })
  account?: Account | null;

  @ApiProperty()
  @Column({ type: 'text' })
  name!: string;

  @ApiProperty()
  @Index('uq_comercio_slug', { unique: true })
  @Column({ type: 'text' })
  slug!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  @Column({ type: 'text', nullable: true })
  address!: string | null;

  @ApiProperty()
  @Column({ type: 'text' })
  timezone!: string;

  /** true = comercio-de-uno auto-creado para un profesional solo. */
  @ApiProperty({ type: Boolean })
  @Column({ name: 'is_personal', type: 'boolean', default: false })
  isPersonal!: boolean;

  @ApiProperty({ type: 'object', additionalProperties: true })
  @Column({ name: 'public_page_settings', type: 'jsonb', default: () => "'{}'::jsonb" })
  publicPageSettings!: ComercioPublicPageSettings;
}
