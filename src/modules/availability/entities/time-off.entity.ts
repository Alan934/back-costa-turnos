import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BaseEntity } from '@/common/base.entity';
import { Staff } from '@/modules/professionals/entities/staff.entity';

/**
 * Vacaciones, feriados y bloqueos manuales.
 */
@Entity('time_off')
@Index('idx_time_off_staff', ['staffId'])
export class TimeOff extends BaseEntity {
  @ApiProperty({ format: 'uuid' })
  @Column({ name: 'staff_id', type: 'uuid' })
  staffId!: string;

  @ManyToOne(() => Staff, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'staff_id' })
  staff?: Staff;

  @ApiProperty({ type: String, format: 'date-time' })
  @Column({ name: 'start_at', type: 'timestamptz' })
  startAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  @Column({ name: 'end_at', type: 'timestamptz' })
  endAt!: Date;

  @ApiPropertyOptional({ nullable: true })
  @Column({ type: 'text', nullable: true })
  reason!: string | null;
}
