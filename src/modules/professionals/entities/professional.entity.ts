import { Column, Entity, Index, JoinColumn, OneToOne } from 'typeorm';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BaseEntity } from '@/common/base.entity';
import { DepositMode } from '@/common/enums';
import { Account } from '@/modules/identity/entities/account.entity';

export interface PublicPageSettings {
  logoFileId?: string;
  primaryColor?: string;
  description?: string;
  [key: string]: unknown;
}

/**
 * El tenant: quien paga la suscripcion (persona sola o negocio).
 */
@Entity('professional')
export class Professional extends BaseEntity {
  @ApiProperty({ format: 'uuid' })
  @Index('uq_professional_account', { unique: true })
  @Column({ name: 'account_id', type: 'uuid' })
  accountId!: string;

  @OneToOne(() => Account, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'account_id' })
  account?: Account;

  @ApiProperty()
  @Column({ name: 'business_name', type: 'text' })
  businessName!: string;

  @ApiProperty()
  @Index('uq_professional_slug', { unique: true })
  @Column({ type: 'text' })
  slug!: string;

  @ApiProperty()
  @Column({ type: 'text' })
  timezone!: string;

  @ApiProperty({ enum: DepositMode, enumName: 'DepositMode' })
  @Column({
    name: 'default_deposit_mode',
    type: 'enum',
    enum: DepositMode,
    enumName: 'deposit_mode',
    default: DepositMode.None,
  })
  defaultDepositMode!: DepositMode;

  @ApiProperty({ type: Number })
  @Column({ name: 'cancellation_window_hours', type: 'integer', default: 24 })
  cancellationWindowHours!: number;

  @ApiProperty({ type: 'object', additionalProperties: true })
  @Column({ name: 'public_page_settings', type: 'jsonb', default: () => "'{}'::jsonb" })
  publicPageSettings!: PublicPageSettings;

  // ---- Conexion MercadoPago (OAuth marketplace): cobra las señas/turnos a su cuenta ----
  /** user_id de MercadoPago del profesional (collector). */
  @ApiPropertyOptional({ nullable: true })
  @Column({ name: 'mp_user_id', type: 'text', nullable: true })
  mpUserId!: string | null;

  /** Access token del profesional para crear pagos a su nombre. Sensible: select:false. */
  @Column({ name: 'mp_access_token', type: 'text', nullable: true, select: false })
  mpAccessToken!: string | null;

  /** Refresh token para renovar el access token del profesional. Sensible: select:false. */
  @Column({ name: 'mp_refresh_token', type: 'text', nullable: true, select: false })
  mpRefreshToken!: string | null;

  @ApiPropertyOptional({ nullable: true })
  @Column({ name: 'mp_public_key', type: 'text', nullable: true })
  mpPublicKey!: string | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  @Column({ name: 'mp_token_expires_at', type: 'timestamptz', nullable: true })
  mpTokenExpiresAt!: Date | null;

  /** Cuando conecto su cuenta de MP (null = no conectada). */
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  @Column({ name: 'mp_connected_at', type: 'timestamptz', nullable: true })
  mpConnectedAt!: Date | null;
}
