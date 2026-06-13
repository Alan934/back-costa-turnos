import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { BaseEntity } from '@/common/base.entity';
import { ScheduleRuleKind } from '@/common/enums';
import { Staff } from '@/modules/professionals/entities/staff.entity';
import { Membership } from '@/modules/comercios/entities/membership.entity';

/**
 * Horarios de atencion y descansos. day_of_week 0-6 (0=domingo). Pertenece a una
 * membresia (profesional-en-comercio): cada profesional define sus horarios por
 * comercio. Una regla aplica a TODOS los servicios o a ciertos (schedule_rule_service).
 * `staff_id` se mantiene por compatibilidad con el calendario actual.
 */
@Entity('schedule_rule')
@Index('idx_schedule_rule_staff', ['staffId'])
@Index('idx_schedule_rule_membership', ['membershipId'])
export class ScheduleRule extends BaseEntity {
  @ApiProperty({ format: 'uuid' })
  @Column({ name: 'staff_id', type: 'uuid' })
  staffId!: string;

  @ManyToOne(() => Staff, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'staff_id' })
  staff?: Staff;

  /** Membresia (profesional-en-comercio) dueña de la regla. */
  @ApiProperty({ format: 'uuid' })
  @Column({ name: 'membership_id', type: 'uuid' })
  membershipId!: string;

  @ManyToOne(() => Membership, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'membership_id' })
  membership?: Membership;

  @ApiProperty({ type: Number })
  @Column({ name: 'day_of_week', type: 'smallint' })
  dayOfWeek!: number;

  @ApiProperty()
  @Column({ name: 'start_time', type: 'time' })
  startTime!: string;

  @ApiProperty()
  @Column({ name: 'end_time', type: 'time' })
  endTime!: string;

  @ApiProperty({ enum: ScheduleRuleKind, enumName: 'ScheduleRuleKind' })
  @Column({
    type: 'enum',
    enum: ScheduleRuleKind,
    enumName: 'schedule_rule_kind',
    default: ScheduleRuleKind.Work,
  })
  kind!: ScheduleRuleKind;

  /**
   * Servicios a los que aplica esta regla (mapeo schedule_rule_service). NO se
   * persiste en esta tabla; se completa al leer. Vacío = aplica a TODOS los
   * servicios de la membresía.
   */
  @ApiProperty({ type: [String], format: 'uuid' })
  serviceIds!: string[];
}
