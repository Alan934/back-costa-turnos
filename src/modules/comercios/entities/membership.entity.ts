import { Column, Entity, Index, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BaseEntity } from '@/common/base.entity';
import { MembershipStatus } from '@/common/enums';
import { Professional } from '@/modules/professionals/entities/professional.entity';
import { Comercio } from './comercio.entity';

/**
 * Membresia: un profesional (trabajador) trabajando en un comercio. Es el
 * "worker-in-comercio". En fases siguientes, sus servicios/horarios/precios
 * cuelgan de aca (membership_id).
 */
@Entity('membership')
@Unique('uq_membership_pro_comercio', ['professionalId', 'comercioId'])
@Index('idx_membership_comercio', ['comercioId'])
@Index('idx_membership_professional', ['professionalId'])
export class Membership extends BaseEntity {
  @ApiProperty({ format: 'uuid' })
  @Column({ name: 'professional_id', type: 'uuid' })
  professionalId!: string;

  @ManyToOne(() => Professional, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'professional_id' })
  professional?: Professional;

  @ApiProperty({ format: 'uuid' })
  @Column({ name: 'comercio_id', type: 'uuid' })
  comercioId!: string;

  @ManyToOne(() => Comercio, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'comercio_id' })
  comercio?: Comercio;

  @ApiProperty({ enum: MembershipStatus, enumName: 'MembershipStatus' })
  @Column({
    type: 'enum',
    enum: MembershipStatus,
    enumName: 'membership_status',
    default: MembershipStatus.Active,
  })
  status!: MembershipStatus;

  /**
   * Dirección propia del profesional EN este comercio (ej. atiende a domicilio o
   * en otra sede). NULL = se usa la dirección del comercio (fallback).
   */
  @ApiPropertyOptional({ type: String, nullable: true })
  @Column({ type: 'text', nullable: true })
  address!: string | null;

  /**
   * Anticipación mínima de reserva (en horas): un cliente solo puede reservar un
   * turno cuyo inicio esté al menos estas horas en el futuro. 0 = sin restricción.
   * Lo define el profesional para su agenda en este comercio.
   */
  @ApiProperty({ type: Number, example: 8 })
  @Column({ name: 'min_booking_hours', type: 'int', default: 0 })
  minBookingHours!: number;
}
