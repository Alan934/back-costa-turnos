import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BaseEntity } from '@/common/base.entity';
import { DepositMode } from '@/common/enums';
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

  @ApiProperty({ enum: DepositMode, enumName: 'DepositMode' })
  @Column({
    name: 'deposit_mode',
    type: 'enum',
    enum: DepositMode,
    enumName: 'deposit_mode',
    default: DepositMode.None,
  })
  depositMode!: DepositMode;

  /** Requerido si deposit_mode <> none. */
  @ApiPropertyOptional({ type: Number, nullable: true })
  @Column({ name: 'deposit_amount_cents', type: 'integer', nullable: true })
  depositAmountCents!: number | null;

  @ApiProperty({ type: Boolean })
  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;
}
