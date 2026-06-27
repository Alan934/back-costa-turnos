import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601 } from 'class-validator';
import { AppointmentStatus } from '@/common/enums';

export class RescheduleMyAppointmentDto {
  @ApiProperty({ example: '2026-06-10T13:00:00Z', description: 'Nuevo inicio del turno' })
  @IsISO8601()
  startAt!: string;
}

export class MyAppointmentBusinessDto {
  @ApiProperty()
  name!: string;
  @ApiProperty()
  slug!: string;
  @ApiPropertyOptional({ type: String, nullable: true })
  address!: string | null;
  @ApiProperty({ type: Number })
  cancellationWindowHours!: number;
  @ApiProperty({ type: Number })
  rescheduleWindowHours!: number;
  /** WhatsApp/teléfono de contacto del negocio (publicPageSettings.phone). null si no lo cargó. */
  @ApiPropertyOptional({ type: String, nullable: true })
  phone!: string | null;
  /** Email de contacto del negocio (publicPageSettings.email). null si no lo cargó. */
  @ApiPropertyOptional({ type: String, nullable: true })
  email!: string | null;
}

export class MyAppointmentDto {
  @ApiProperty()
  id!: string;
  @ApiProperty({ type: String, format: 'date-time' })
  startAt!: string;
  @ApiProperty({ type: String, format: 'date-time' })
  endAt!: string;
  @ApiProperty({ enum: AppointmentStatus, enumName: 'AppointmentStatus' })
  status!: AppointmentStatus;
  @ApiProperty({ type: Boolean })
  isProvisional!: boolean;
  @ApiProperty({
    format: 'uuid',
    description: 'Servicio del turno (para consultar slots al reprogramar)',
  })
  serviceId!: string;
  @ApiProperty({
    format: 'uuid',
    description: 'Membresía profesional-en-comercio donde ocurre el turno',
  })
  membershipId!: string;
  @ApiProperty({ format: 'uuid', description: 'Profesional dueño de la agenda' })
  professionalId!: string;
  @ApiProperty()
  serviceName!: string;
  @ApiProperty({ type: Number })
  priceCents!: number;
  @ApiProperty()
  staffName!: string;
  @ApiProperty({ type: MyAppointmentBusinessDto })
  business!: MyAppointmentBusinessDto;
}
