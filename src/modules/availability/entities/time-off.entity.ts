import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BaseEntity } from '@/common/base.entity';
import { TimeOffType } from '@/common/enums';
import { Staff } from '@/modules/professionals/entities/staff.entity';
import { Membership } from '@/modules/comercios/entities/membership.entity';

/**
 * Vacaciones, feriados y bloqueos manuales. Pertenece a una membresia
 * (profesional-en-comercio). `staff_id` se mantiene por compatibilidad.
 */
@Entity('time_off')
@Index('idx_time_off_staff', ['staffId'])
@Index('idx_time_off_membership', ['membershipId'])
export class TimeOff extends BaseEntity {
  @ApiProperty({ format: 'uuid' })
  @Column({ name: 'staff_id', type: 'uuid' })
  staffId!: string;

  @ManyToOne(() => Staff, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'staff_id' })
  staff?: Staff;

  /** Membresia (profesional-en-comercio) dueña del bloqueo. */
  @ApiProperty({ format: 'uuid' })
  @Column({ name: 'membership_id', type: 'uuid' })
  membershipId!: string;

  @ManyToOne(() => Membership, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'membership_id' })
  membership?: Membership;

  @ApiProperty({ type: String, format: 'date-time' })
  @Column({ name: 'start_at', type: 'timestamptz' })
  startAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  @Column({ name: 'end_at', type: 'timestamptz' })
  endAt!: Date;

  /**
   * Tipo de ausencia (feriado / vacaciones / bloqueo). Lo elige el profesional al
   * crear el bloqueo; se propaga al `day-availability` público para que el front
   * coloree feriado/vacaciones/bloqueo sin adivinar por el texto de `reason`.
   */
  @ApiProperty({ enum: TimeOffType, enumName: 'TimeOffType' })
  @Column({ type: 'text', default: TimeOffType.Block })
  type!: TimeOffType;

  @ApiPropertyOptional({ type: String, nullable: true })
  @Column({ type: 'text', nullable: true })
  reason!: string | null;
}
