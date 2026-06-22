import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BaseEntity } from '@/common/base.entity';
import { NumericTransformer } from '@/common/numeric.transformer';
import { Professional } from '@/modules/professionals/entities/professional.entity';
import { Comercio } from '@/modules/comercios/entities/comercio.entity';
import { Membership } from '@/modules/comercios/entities/membership.entity';
import { ServiceMembership } from './service-membership.entity';

/** Asignación de un servicio a una membresía (resumida para la página/gestión). */
export class ServiceAssignedMembership {
  @ApiProperty({ format: 'uuid' })
  membershipId!: string;

  @ApiProperty({ format: 'uuid' })
  professionalId!: string;

  @ApiProperty({ example: 'Lucía Pérez' })
  displayName!: string;
}

/** Desglose de un monto: base (sin IVA), IVA y total (con IVA). Solo MP lleva IVA. */
export class ServicePriceBreakdown {
  @ApiProperty({ type: Number, description: 'Precio sin IVA (centavos).' })
  baseCents!: number;

  @ApiProperty({ type: Number, description: 'IVA en centavos (0 si el profesional lo absorbe).' })
  vatAmountCents!: number;

  @ApiProperty({ type: Number, description: 'Total con IVA (centavos) = base + IVA.' })
  totalCents!: number;
}

/** Precios con/sin IVA del servicio (campo derivado para el front). */
export class ServicePricing {
  @ApiProperty({ type: Number, description: 'IVA efectivo (%) aplicado a pagos por Mercado Pago.' })
  vatPercent!: number;

  @ApiProperty({
    type: Boolean,
    description: 'true = el IVA se cobra al cliente; false = absorbido.',
  })
  vatChargedToClient!: boolean;

  @ApiProperty({ type: ServicePriceBreakdown, description: 'Pago completo por Mercado Pago.' })
  full!: ServicePriceBreakdown;

  @ApiPropertyOptional({
    type: ServicePriceBreakdown,
    nullable: true,
    description: 'Seña por Mercado Pago (null si el servicio no admite seña).',
  })
  deposit!: ServicePriceBreakdown | null;
}

/**
 * Catalogo de servicios. Define duracion (bloqueo de calendario) y politica de sena.
 * El servicio pertenece al COMERCIO (`comercio_id`) y se asigna a una o varias
 * membresias (profesional-en-comercio) via `service_membership` (N:M); precio y
 * duracion son uniformes. `membership_id`/`professional_id` se conservan como
 * creador/legacy (el primer profesional asignado) para compat de tenanting.
 */
@Entity('service')
@Index('idx_service_tenant', ['professionalId'])
@Index('idx_service_membership', ['membershipId'])
@Index('idx_service_comercio', ['comercioId'])
export class Service extends BaseEntity {
  @ApiProperty({ format: 'uuid' })
  @Column({ name: 'professional_id', type: 'uuid' })
  professionalId!: string;

  @ManyToOne(() => Professional, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'professional_id' })
  professional?: Professional;

  /** Comercio dueño del servicio. */
  @ApiProperty({ format: 'uuid' })
  @Column({ name: 'comercio_id', type: 'uuid' })
  comercioId!: string;

  @ManyToOne(() => Comercio, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'comercio_id' })
  comercio?: Comercio;

  /** Membresia creadora/legacy (primer profesional asignado). */
  @ApiProperty({ format: 'uuid' })
  @Column({ name: 'membership_id', type: 'uuid' })
  membershipId!: string;

  @ManyToOne(() => Membership, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'membership_id' })
  membership?: Membership;

  @OneToMany(() => ServiceMembership, (sm) => sm.service)
  serviceMemberships?: ServiceMembership[];

  @ApiProperty()
  @Column({ type: 'text' })
  name!: string;

  /** Descripción opcional del servicio: qué incluye, qué se realiza, etc. */
  @ApiPropertyOptional({ type: String, nullable: true })
  @Column({ type: 'text', nullable: true })
  description!: string | null;

  /**
   * Hasta 3 imágenes de ejemplo del servicio (object_keys en MinIO, subidas vía
   * `POST /files?ownerType=service`). Sirven para ilustrar qué se realiza.
   */
  @ApiProperty({ type: [String], description: 'object_keys de imágenes de ejemplo (máx. 3)' })
  @Column({ name: 'image_keys', type: 'jsonb', default: () => "'[]'::jsonb" })
  imageKeys!: string[];

  @ApiProperty({ type: Number })
  @Column({ name: 'duration_minutes', type: 'integer' })
  durationMinutes!: number;

  @ApiProperty({ type: Number })
  @Column({ name: 'price_cents', type: 'integer', default: 0 })
  priceCents!: number;

  // ---- Opciones de pago habilitadas (el profesional puede combinar varias) ----
  /** Permite reservar pagando una seña. Requiere deposit_amount_cents. */
  @ApiProperty({ type: Boolean })
  @Column({ name: 'allow_deposit', type: 'boolean', default: false })
  allowDeposit!: boolean;

  /** Permite reservar pagando el precio completo (price_cents). */
  @ApiProperty({ type: Boolean })
  @Column({ name: 'allow_full_payment', type: 'boolean', default: false })
  allowFullPayment!: boolean;

  /** Permite reservar sin pagar (si además hay opción paga, queda provisional). */
  @ApiProperty({ type: Boolean })
  @Column({ name: 'allow_no_payment', type: 'boolean', default: true })
  allowNoPayment!: boolean;

  /**
   * Permite reservar pagando en efectivo (precio completo, sin IVA/recargo). El turno
   * queda confirmado/fijo, pero el cobro se confirma en persona al finalizar (cierre de
   * caja). No requiere MercadoPago conectado.
   */
  @ApiProperty({ type: Boolean })
  @Column({ name: 'allow_cash', type: 'boolean', default: false })
  allowCash!: boolean;

  /**
   * Permite reservar pagando por transferencia / QR / alias / CVU. Cobro fuera del sistema:
   * funciona igual que efectivo (sin IVA, turno fijo, el profesional confirma el cobro).
   */
  @ApiProperty({ type: Boolean })
  @Column({ name: 'allow_transfer', type: 'boolean', default: false })
  allowTransfer!: boolean;

  // ---- IVA (solo pagos por Mercado Pago). null = hereda del profesional. ----
  /** IVA (%) para este servicio. null = usa el default del profesional. */
  @ApiPropertyOptional({ type: Number, nullable: true })
  @Column({
    name: 'vat_percent',
    type: 'numeric',
    precision: 5,
    scale: 2,
    nullable: true,
    transformer: NumericTransformer,
  })
  vatPercent!: number | null;

  /** Si el IVA se cobra al cliente. null = hereda del profesional. */
  @ApiPropertyOptional({ type: Boolean, nullable: true })
  @Column({ name: 'vat_charged_to_client', type: 'boolean', nullable: true })
  vatChargedToClient!: boolean | null;

  /** Monto de la seña (centavos). Requerido si allow_deposit. */
  @ApiPropertyOptional({ type: Number, nullable: true })
  @Column({ name: 'deposit_amount_cents', type: 'integer', nullable: true })
  depositAmountCents!: number | null;

  /**
   * Cuántos clientes pueden reservar el mismo horario para este servicio.
   * Default 1 (exclusivo). Útil para servicios grupales o con equipamiento paralelo
   * (ej. autolavado con dos pistas: capacity 2 permite dos reservas simultáneas).
   */
  @ApiProperty({ type: Number, default: 1, minimum: 1 })
  @Column({ name: 'capacity', type: 'integer', default: 1 })
  capacity!: number;

  @ApiProperty({ type: Boolean })
  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  /**
   * Campo derivado (no persistido): profesionales (membresias activas) que ofrecen
   * este servicio. Lo rellena CatalogService en las lecturas a nivel comercio.
   */
  @ApiPropertyOptional({ type: ServiceAssignedMembership, isArray: true })
  assignedMemberships?: ServiceAssignedMembership[];

  /**
   * Campo derivado (no persistido): URLs firmadas temporales de `imageKeys`, listas
   * para mostrar (`<img src>`). Las rellena CatalogService en las lecturas.
   */
  @ApiPropertyOptional({ type: [String], description: 'URLs firmadas (temporales) de imageKeys' })
  imageUrls?: string[];

  /**
   * Campo derivado (no persistido): precios con/sin IVA. Lo rellena CatalogService en las
   * lecturas, resolviendo el IVA efectivo (override del servicio o default del profesional).
   */
  @ApiPropertyOptional({ type: ServicePricing })
  pricing?: ServicePricing;
}
