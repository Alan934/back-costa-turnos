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
}
