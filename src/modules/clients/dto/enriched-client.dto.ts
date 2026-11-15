import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProfessionalClientStatus } from '@/common/enums';

/**
 * Cliente (membership) con los datos de la persona embebidos en plano + un
 * resumen de visitas. Es lo que consume la pantalla de clientes del front.
 */
export class EnrichedClientDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  personId!: string;

  @ApiProperty({ enum: ProfessionalClientStatus, enumName: 'ProfessionalClientStatus' })
  status!: ProfessionalClientStatus;

  @ApiProperty({ type: 'object', additionalProperties: true })
  fichaValues!: Record<string, unknown>;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: string;

  @ApiProperty({ description: 'Nombre de la persona' })
  fullName!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  email!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  phone!: string | null;

  @ApiProperty({ type: Number, description: 'Cantidad de turnos atendidos (done)' })
  visitCount!: number;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  lastVisitAt!: string | null;

  /**
   * Último turno que ya pasó y no se canceló ni faltó (atendido o no marcado). Sirve para
   * "no viene hace X semanas" aunque el profesional no marque los turnos como atendidos.
   */
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  lastAppointmentAt!: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Servicio de ese último turno (para "darle el mismo turno")',
  })
  lastServiceId!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, description: 'Quién lo atendió' })
  lastStaffId!: string | null;

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'Próximo turno pendiente (null = no tiene ninguno reservado)',
  })
  nextAppointmentAt!: string | null;
}
