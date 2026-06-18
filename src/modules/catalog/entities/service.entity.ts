import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BaseEntity } from '@/common/base.entity';
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
}
