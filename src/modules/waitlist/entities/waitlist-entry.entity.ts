import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BaseEntity } from '@/common/base.entity';
import { WaitlistStatus } from '@/common/enums';
import { Professional } from '@/modules/professionals/entities/professional.entity';
import { Staff } from '@/modules/professionals/entities/staff.entity';
import { Person } from '@/modules/identity/entities/person.entity';
import { Service } from '@/modules/catalog/entities/service.entity';

/**
 * Lista de espera: cliente que quiere un turno dentro de un rango deseado.
 */
@Entity('waitlist_entry')
@Index('idx_waitlist_tenant_status', ['professionalId', 'status'])
export class WaitlistEntry extends BaseEntity {
  @ApiProperty({ format: 'uuid' })
  @Column({ name: 'professional_id', type: 'uuid' })
  professionalId!: string;

  @ManyToOne(() => Professional, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'professional_id' })
  professional?: Professional;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @Column({ name: 'staff_id', type: 'uuid', nullable: true })
  staffId!: string | null;

  @ManyToOne(() => Staff, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'staff_id' })
  staff?: Staff | null;

  @ApiProperty({ format: 'uuid' })
  @Column({ name: 'person_id', type: 'uuid' })
  personId!: string;

  @ManyToOne(() => Person, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'person_id' })
  person?: Person;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @Column({ name: 'service_id', type: 'uuid', nullable: true })
  serviceId!: string | null;

  @ManyToOne(() => Service, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'service_id' })
  service?: Service | null;

  @ApiProperty({ type: String, format: 'date-time' })
  @Column({ name: 'desired_from', type: 'timestamptz' })
  desiredFrom!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  @Column({ name: 'desired_to', type: 'timestamptz' })
  desiredTo!: Date;

  @ApiProperty({ enum: WaitlistStatus, enumName: 'WaitlistStatus' })
  @Column({
    type: 'enum',
    enum: WaitlistStatus,
    enumName: 'waitlist_status',
    default: WaitlistStatus.Waiting,
  })
  status!: WaitlistStatus;
}
