import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BaseEntity } from '@/common/base.entity';
import { AppointmentStatus, CancellationReason, CreatedVia } from '@/common/enums';
import { Professional } from '@/modules/professionals/entities/professional.entity';
import { Staff } from '@/modules/professionals/entities/staff.entity';
import { Person } from '@/modules/identity/entities/person.entity';
import { Service } from '@/modules/catalog/entities/service.entity';

/**
 * Turno. Incluye el flujo de sena (none/required/hybrid) y la sala de espera.
 */
@Entity('appointment')
@Index('idx_appointment_tenant_start', ['professionalId', 'startAt'])
@Index('idx_appointment_staff_start', ['staffId', 'startAt'])
@Index('idx_appointment_status', ['professionalId', 'status'])
export class Appointment extends BaseEntity {
  @ApiProperty({ format: 'uuid' })
  @Column({ name: 'professional_id', type: 'uuid' })
  professionalId!: string;

  @ManyToOne(() => Professional, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'professional_id' })
  professional?: Professional;

  @ApiProperty({ format: 'uuid' })
  @Column({ name: 'staff_id', type: 'uuid' })
  staffId!: string;

  @ManyToOne(() => Staff, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'staff_id' })
  staff?: Staff;

  @ApiProperty({ format: 'uuid' })
  @Column({ name: 'person_id', type: 'uuid' })
  personId!: string;

  @ManyToOne(() => Person, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'person_id' })
  person?: Person;

  @ApiProperty({ format: 'uuid' })
  @Column({ name: 'service_id', type: 'uuid' })
  serviceId!: string;

  @ManyToOne(() => Service, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'service_id' })
  service?: Service;

  @ApiProperty({ type: String, format: 'date-time' })
  @Column({ name: 'start_at', type: 'timestamptz' })
  startAt!: Date;

  /** Derivado de la duracion, pero guardado. */
  @ApiProperty({ type: String, format: 'date-time' })
  @Column({ name: 'end_at', type: 'timestamptz' })
  endAt!: Date;

  @ApiProperty({ enum: AppointmentStatus, enumName: 'AppointmentStatus' })
  @Column({
    type: 'enum',
    enum: AppointmentStatus,
    enumName: 'appointment_status',
    default: AppointmentStatus.Requested,
  })
  status!: AppointmentStatus;

  /** Caso hibrido: reservado sin sena, puede ser desplazado (bumped). */
  @ApiProperty({ type: Boolean })
  @Column({ name: 'is_provisional', type: 'boolean', default: false })
  isProvisional!: boolean;

  @ApiPropertyOptional({
    enum: CancellationReason,
    enumName: 'CancellationReason',
    nullable: true,
  })
  @Column({
    name: 'cancellation_reason',
    type: 'enum',
    enum: CancellationReason,
    enumName: 'cancellation_reason',
    nullable: true,
  })
  cancellationReason!: CancellationReason | null;

  /** Cuando paso a in_progress (para el ETA de la sala de espera). */
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  @Column({ name: 'actual_start_at', type: 'timestamptz', nullable: true })
  actualStartAt!: Date | null;

  @ApiProperty({ enum: CreatedVia, enumName: 'CreatedVia' })
  @Column({
    name: 'created_via',
    type: 'enum',
    enum: CreatedVia,
    enumName: 'created_via',
    default: CreatedVia.ClientSelf,
  })
  createdVia!: CreatedVia;
}
