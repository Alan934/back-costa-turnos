import { Column, Entity, Index, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { BaseEntity } from '@/common/base.entity';
import { ProfessionalClientStatus } from '@/common/enums';
import { Professional } from '@/modules/professionals/entities/professional.entity';
import { Person } from '@/modules/identity/entities/person.entity';

/**
 * La membresia: vincula una person con un professional. Aca vive todo lo
 * per-tenant. Es el corazon del aislamiento.
 * UNIQUE(professional_id, person_id).
 */
@Entity('professional_client')
@Unique('uq_professional_client', ['professionalId', 'personId'])
@Index('idx_professional_client_tenant', ['professionalId'])
export class ProfessionalClient extends BaseEntity {
  @ApiProperty({ format: 'uuid' })
  @Column({ name: 'professional_id', type: 'uuid' })
  professionalId!: string;

  @ManyToOne(() => Professional, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'professional_id' })
  professional?: Professional;

  @ApiProperty({ format: 'uuid' })
  @Column({ name: 'person_id', type: 'uuid' })
  personId!: string;

  @ManyToOne(() => Person, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'person_id' })
  person?: Person;

  /** Valores de los campos dinamicos, indexados por ficha_field.id. */
  @ApiProperty({ type: 'object', additionalProperties: true })
  @Column({ name: 'ficha_values', type: 'jsonb', default: () => "'{}'::jsonb" })
  fichaValues!: Record<string, unknown>;

  @ApiProperty({ enum: ProfessionalClientStatus, enumName: 'ProfessionalClientStatus' })
  @Column({
    type: 'enum',
    enum: ProfessionalClientStatus,
    enumName: 'professional_client_status',
    default: ProfessionalClientStatus.Active,
  })
  status!: ProfessionalClientStatus;
}
