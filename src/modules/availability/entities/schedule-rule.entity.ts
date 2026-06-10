import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { BaseEntity } from '@/common/base.entity';
import { ScheduleRuleKind } from '@/common/enums';
import { Staff } from '@/modules/professionals/entities/staff.entity';

/**
 * Horarios de atencion y descansos, por staff. day_of_week 0-6 (0=domingo).
 */
@Entity('schedule_rule')
@Index('idx_schedule_rule_staff', ['staffId'])
export class ScheduleRule extends BaseEntity {
  @ApiProperty({ format: 'uuid' })
  @Column({ name: 'staff_id', type: 'uuid' })
  staffId!: string;

  @ManyToOne(() => Staff, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'staff_id' })
  staff?: Staff;

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
}
