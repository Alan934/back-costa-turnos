import { Column, Entity, Index, JoinColumn, OneToOne } from 'typeorm';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BaseEntity } from '@/common/base.entity';
import { DepositMode } from '@/common/enums';
import { NumericTransformer } from '@/common/numeric.transformer';
import { Account } from '@/modules/identity/entities/account.entity';

export interface PublicPageSettings {
  logoFileId?: string;
  primaryColor?: string;
  description?: string;
  bio?: string;
  /** Teléfono/WhatsApp de contacto del negocio (lo expone la página pública y "mis turnos"). */
  phone?: string;
  /** Email de contacto del negocio (opcional; lo expone "mis turnos" para el botón de mail). */
  email?: string;
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

  /** Direccion del negocio (para la pagina publica y "mis turnos" del cliente). */
  @ApiPropertyOptional({ type: String, nullable: true })
  @Column({ type: 'text', nullable: true })
  address!: string | null;

  @ApiProperty({ enum: DepositMode, enumName: 'DepositMode' })
  @Column({
    name: 'default_deposit_mode',
    type: 'enum',
    enum: DepositMode,
    enumName: 'deposit_mode',
    default: DepositMode.None,
  })
  defaultDepositMode!: DepositMode;

  /**
   * IVA por defecto (%) que se le cobra al cliente en pagos por Mercado Pago, para cubrir
   * la comisión de Checkout. Editable; cada servicio puede sobrescribirlo. Default 4.5.
   */
  @ApiProperty({ type: Number, example: 4.5 })
  @Column({
    name: 'default_vat_percent',
    type: 'numeric',
    precision: 5,
    scale: 2,
    default: 4.5,
    transformer: NumericTransformer,
  })
  defaultVatPercent!: number;

  /** true = el IVA se le suma al cliente; false = el profesional lo absorbe (no se cobra). */
  @ApiProperty({ type: Boolean })
  @Column({ name: 'vat_charged_to_client', type: 'boolean', default: true })
  vatChargedToClient!: boolean;

  @ApiProperty({ type: Number })
  @Column({ name: 'cancellation_window_hours', type: 'integer', default: 24 })
  cancellationWindowHours!: number;

  /** Horas mínimas antes del turno hasta las que el cliente puede reprogramarlo. 0 = sin restricción. */
  @ApiProperty({ type: Number })
  @Column({ name: 'reschedule_window_hours', type: 'integer', default: 24 })
  rescheduleWindowHours!: number;

  /**
   * Confirmación del día anterior: el recordatorio le pide al cliente "Confirmo / No puedo ir"
   * (y "No puedo ir" libera el horario aunque esté dentro de la ventana de cancelación).
   * Apagado por defecto.
   */
  @ApiProperty({ type: Boolean })
  @Column({ name: 'ask_confirmation', type: 'boolean', default: false })
  askConfirmation!: boolean;

  @ApiProperty({ type: 'object', additionalProperties: true })
  @Column({ name: 'public_page_settings', type: 'jsonb', default: () => "'{}'::jsonb" })
  publicPageSettings!: PublicPageSettings;

  /**
   * Preferencias de avisos al profesional (reserva nueva, cancelación, reprogramación).
   * Un canal está activo salvo que figure explícitamente en false: `{}` = todo activado.
   */
  @ApiProperty({ type: 'object', additionalProperties: true })
  @Column({ name: 'notification_prefs', type: 'jsonb', default: () => "'{}'::jsonb" })
  notificationPrefs!: { email?: boolean; push?: boolean; dailySummary?: boolean };

  /** Hasta cuándo ya vio las "Novedades" del Inicio (lo marca él; sirve en todos sus equipos). */
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  @Column({ name: 'news_seen_at', type: 'timestamptz', nullable: true })
  newsSeenAt!: Date | null;

  // ---- Conexion MercadoPago (OAuth marketplace): cobra las señas/turnos a su cuenta ----
  /** user_id de MercadoPago del profesional (collector). */
  @ApiPropertyOptional({ type: String, nullable: true })
  @Column({ name: 'mp_user_id', type: 'text', nullable: true })
  mpUserId!: string | null;

  /** Access token del profesional para crear pagos a su nombre. Sensible: select:false. */
  @Column({ name: 'mp_access_token', type: 'text', nullable: true, select: false })
  mpAccessToken!: string | null;

  /** Refresh token para renovar el access token del profesional. Sensible: select:false. */
  @Column({ name: 'mp_refresh_token', type: 'text', nullable: true, select: false })
  mpRefreshToken!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
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
