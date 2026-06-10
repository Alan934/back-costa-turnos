import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BaseEntity } from '@/common/base.entity';
import { CalendarProvider } from '@/common/enums';
import { Staff } from '@/modules/professionals/entities/staff.entity';

/**
 * Integracion de calendario externo (Google Calendar). Opcional.
 * Los tokens se guardan cifrados a nivel aplicacion.
 */
@Entity('staff_calendar_integration')
@Index('idx_calendar_integration_staff', ['staffId'])
export class StaffCalendarIntegration extends BaseEntity {
  @ApiProperty({ format: 'uuid' })
  @Column({ name: 'staff_id', type: 'uuid' })
  staffId!: string;

  @ManyToOne(() => Staff, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'staff_id' })
  staff?: Staff;

  @ApiProperty({ enum: CalendarProvider, enumName: 'CalendarProvider' })
  @Column({
    type: 'enum',
    enum: CalendarProvider,
    enumName: 'calendar_provider',
    default: CalendarProvider.Google,
  })
  provider!: CalendarProvider;

  @ApiProperty()
  @Column({ name: 'access_token', type: 'text' })
  accessToken!: string;

  @ApiProperty()
  @Column({ name: 'refresh_token', type: 'text' })
  refreshToken!: string;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt!: Date | null;

  @ApiProperty()
  @Column({ name: 'external_calendar_id', type: 'text' })
  externalCalendarId!: string;
}
