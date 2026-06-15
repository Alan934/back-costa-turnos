import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { ScheduleRuleKind } from '@/common/enums';

const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/;

export class CreateScheduleRuleDto {
  @ApiProperty({ example: 1, description: '0=domingo ... 6=sabado' })
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek!: number;

  @ApiProperty({ example: '09:00' })
  @Matches(TIME_REGEX, { message: 'start_time debe ser HH:mm' })
  startTime!: string;

  @ApiProperty({ example: '13:00' })
  @Matches(TIME_REGEX, { message: 'end_time debe ser HH:mm' })
  endTime!: string;

  @ApiPropertyOptional({ enum: ScheduleRuleKind })
  @IsOptional()
  @IsEnum(ScheduleRuleKind)
  kind?: ScheduleRuleKind;

  /**
   * Servicios a los que aplica esta regla. Vacío/omitido = aplica a TODOS los
   * servicios de la membresía. Solo tiene efecto en reglas de trabajo (work).
   */
  @ApiPropertyOptional({ type: [String], format: 'uuid' })
  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  serviceIds?: string[];
}

/**
 * Edición in-place de una regla de horario. Todos los campos son opcionales: solo
 * se actualiza lo enviado. `serviceIds` presente REEMPLAZA el mapeo (vacío = vuelve
 * a "todos los servicios"); omitido lo deja como estaba.
 */
export class UpdateScheduleRuleDto {
  @ApiPropertyOptional({ example: 1, description: '0=domingo ... 6=sabado' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek?: number;

  @ApiPropertyOptional({ example: '09:00' })
  @IsOptional()
  @Matches(TIME_REGEX, { message: 'start_time debe ser HH:mm' })
  startTime?: string;

  @ApiPropertyOptional({ example: '13:00' })
  @IsOptional()
  @Matches(TIME_REGEX, { message: 'end_time debe ser HH:mm' })
  endTime?: string;

  @ApiPropertyOptional({ enum: ScheduleRuleKind })
  @IsOptional()
  @IsEnum(ScheduleRuleKind)
  kind?: ScheduleRuleKind;

  @ApiPropertyOptional({
    type: [String],
    format: 'uuid',
    description: 'Reemplaza el mapeo de servicios. Vacío = todos. Omitido = sin cambios.',
  })
  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  serviceIds?: string[];
}

export class CreateTimeOffDto {
  @ApiProperty({ example: '2026-07-01T00:00:00Z' })
  @IsISO8601()
  startAt!: string;

  @ApiProperty({ example: '2026-07-10T00:00:00Z' })
  @IsISO8601()
  endAt!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}

export class AvailabilityQueryDto {
  @ApiProperty()
  @IsString()
  staffId!: string;

  @ApiProperty()
  @IsString()
  serviceId!: string;

  @ApiProperty({ example: '2026-06-10', description: 'fecha desde (YYYY-MM-DD)' })
  @IsISO8601()
  from!: string;

  @ApiProperty({ example: '2026-06-17', description: 'fecha hasta (YYYY-MM-DD)' })
  @IsISO8601()
  to!: string;
}

/** Query de slots por comercio (la membresía la resuelve el guard). */
export class ComercioSlotsQueryDto {
  @ApiProperty()
  @IsString()
  serviceId!: string;

  @ApiProperty({ example: '2026-06-10', description: 'fecha desde (YYYY-MM-DD)' })
  @IsISO8601()
  from!: string;

  @ApiProperty({ example: '2026-06-17', description: 'fecha hasta (YYYY-MM-DD)' })
  @IsISO8601()
  to!: string;
}

export interface AvailableSlot {
  startAt: string;
  endAt: string;
}

/** Por qué un día no admite reservas (para el chip deshabilitado en el front). */
export enum DayAvailabilityStatus {
  /** Hay al menos un slot libre ese día. */
  Available = 'available',
  /** No hay horario de atención ese día de la semana (no hay reglas de trabajo). */
  Closed = 'closed',
  /** El profesional bloqueó ese día (vacaciones/feriado/bloqueo manual). */
  TimeOff = 'time_off',
  /** Hay horario de atención pero está completo (turnos/descansos lo ocupan). */
  Full = 'full',
}

/** Estado de disponibilidad de un día concreto, para mostrar el motivo al cliente. */
export class DayAvailabilityDto {
  @ApiProperty({
    example: '2026-07-01',
    description: 'Fecha (YYYY-MM-DD) en la zona del comercio.',
  })
  date!: string;

  @ApiProperty({ enum: DayAvailabilityStatus, enumName: 'DayAvailabilityStatus' })
  status!: DayAvailabilityStatus;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description:
      'Motivo del bloqueo cuando status=time_off (texto cargado por el profesional). null en otros casos.',
  })
  reason!: string | null;

  @ApiProperty({
    type: Boolean,
    description: 'true si hay al menos un slot libre (status=available).',
  })
  bookable!: boolean;
}
