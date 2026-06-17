import { Column, Entity, Index, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { BaseEntity } from '@/common/base.entity';
import { Membership } from '@/modules/comercios/entities/membership.entity';
import { Service } from './service.entity';

/**
 * Asignación N:M de un servicio (del comercio) a una membresía (profesional-en-comercio).
 * Un servicio pertenece al comercio y lo ofrecen una o varias membresías; cada
 * profesional aporta su propia agenda para ese servicio.
 */
@Entity('service_membership')
@Unique('uq_service_membership', ['serviceId', 'membershipId'])
@Index('idx_service_membership_service', ['serviceId'])
@Index('idx_service_membership_membership', ['membershipId'])
export class ServiceMembership extends BaseEntity {
  @ApiProperty({ format: 'uuid' })
  @Column({ name: 'service_id', type: 'uuid' })
  serviceId!: string;

  @ManyToOne(() => Service, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'service_id' })
  service?: Service;

  @ApiProperty({ format: 'uuid' })
  @Column({ name: 'membership_id', type: 'uuid' })
  membershipId!: string;

  @ManyToOne(() => Membership, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'membership_id' })
  membership?: Membership;
}
