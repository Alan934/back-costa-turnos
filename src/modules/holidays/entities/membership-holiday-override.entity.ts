import { Column, Entity, Index, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { BaseEntity } from '@/common/base.entity';
import { Membership } from '@/modules/comercios/entities/membership.entity';

/**
 * Excepción del profesional para UN feriado concreto: pisa el valor general
 * `membership.works_holidays`. `works=true` = ese feriado sí trabaja; `works=false` = ese
 * feriado no trabaja (aunque en general sí trabaje los feriados).
 */
@Entity('membership_holiday_override')
@Unique('uq_membership_holiday_override', ['membershipId', 'date'])
@Index('idx_membership_holiday_override_membership', ['membershipId'])
export class MembershipHolidayOverride extends BaseEntity {
  @ApiProperty({ format: 'uuid' })
  @Column({ name: 'membership_id', type: 'uuid' })
  membershipId!: string;

  @ManyToOne(() => Membership, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'membership_id' })
  membership?: Membership;

  @ApiProperty({ example: '2026-05-25', description: 'YYYY-MM-DD' })
  @Column({ type: 'date' })
  date!: string;

  @ApiProperty()
  @Column({ type: 'boolean' })
  works!: boolean;
}
