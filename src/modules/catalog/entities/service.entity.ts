import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BaseEntity } from '@/common/base.entity';
import { Professional } from '@/modules/professionals/entities/professional.entity';

/**
 * Catalogo de servicios. Define duracion (bloqueo de calendario) y politica de sena.
 */
@Entity('service')
@Index('idx_service_tenant', ['professionalId'])
export class Service extends BaseEntity {
  @ApiProperty({ format: 'uuid' })
  @Column({ name: 'professional_id', type: 'uuid' })
  professionalId!: string;

  @ManyToOne(() => Professional, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'professional_id' })
  professional?: Professional;

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

  /** Monto de la seña (centavos). Requerido si allow_deposit. */
  @ApiPropertyOptional({ type: Number, nullable: true })
  @Column({ name: 'deposit_amount_cents', type: 'integer', nullable: true })
  depositAmountCents!: number | null;

  @ApiProperty({ type: Boolean })
  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;
}
