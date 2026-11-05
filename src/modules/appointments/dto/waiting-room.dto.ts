import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { AppointmentStatus, WaitingRoomStatus } from '@/common/enums';
import { WalkInStatusDto } from '@/modules/availability/dto/availability.dto';
import { IsPhone, PHONE_DESCRIPTION } from '@/common/decorators/phone.decorator';
import { TitleCase } from '@/common/decorators/title-case.decorator';

/**
 * Una persona presente en la sala de espera. Se expone tal cual en la pantalla
 * PÚBLICA del local, así que no puede llevar datos de contacto: solo nombre de
 * pila, número de turno y tiempos.
 */
export class WaitingItemDto {
  @ApiProperty({ format: 'uuid' })
  appointmentId!: string;

  @ApiProperty({
    example: 'Juan',
    description: 'Nombre de pila. Nunca el nombre completo: esto se ve en una pantalla pública.',
  })
  displayName!: string;

  @ApiProperty({ example: 14, description: 'Número de turno del día para esta agenda.' })
  ticketNumber!: number;

  @ApiProperty({ example: 2, description: 'Cuántas personas tiene delante. 0 = es el siguiente.' })
  position!: number;

  @ApiProperty({ example: 25, description: 'Minutos estimados hasta que le toque.' })
  etaMinutes!: number;

  @ApiProperty({ enum: AppointmentStatus, enumName: 'AppointmentStatus' })
  status!: AppointmentStatus;

  @ApiProperty({ example: 'Corte de pelo' })
  serviceName!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  startAt!: string;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  checkedInAt!: string | null;

  @ApiProperty({ type: Boolean, description: 'Llegó sin turno (se anotó en el momento).' })
  isWalkIn!: boolean;

  @ApiProperty({ type: Boolean, description: 'Turno sin seña desplazable (reserva provisional).' })
  isProvisional!: boolean;

  @ApiProperty({ type: Boolean, description: 'Pasa al frente de la cola (urgencia).' })
  isPriority!: boolean;

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'Última vez que lo llamaron. Con valor y sin empezar = "llamando ahora".',
  })
  calledAt!: string | null;

  @ApiProperty({ type: Number, description: 'Cuántas veces lo llamaron.' })
  callCount!: number;

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'Si está ausente ("me voy y vuelvo"): hasta cuándo. Se lo saltea mientras tanto.',
  })
  awayUntil!: string | null;

  @ApiProperty({
    type: Boolean,
    description: 'ETA calculado con la duración REAL promedio de este profesional (≥3 atenciones).',
  })
  etaLearned!: boolean;
}

/** Estado completo de la sala de espera de una agenda. */
export class WaitingRoomDto {
  @ApiProperty({ format: 'uuid' })
  staffId!: string;

  @ApiProperty({ example: 'Carla' })
  staffName!: string;

  @ApiProperty({ format: 'uuid' })
  membershipId!: string;

  @ApiProperty({ enum: WaitingRoomStatus, enumName: 'WaitingRoomStatus' })
  status!: WaitingRoomStatus;

  @ApiPropertyOptional({ type: String, nullable: true, example: 'Vuelvo 15:30' })
  note!: string | null;

  @ApiProperty({ type: Boolean, description: 'El cliente puede anotarse solo escaneando el QR.' })
  selfCheckInEnabled!: boolean;

  @ApiProperty({
    type: Boolean,
    description:
      'Se puede anotar AHORA: self check-in habilitado, sala no cerrada y, si el profesional ' +
      'define franjas por orden de llegada, dentro de una de ellas. Es lo que decide si se ' +
      'muestra el botón "Anotarme".',
  })
  selfCheckInOpen!: boolean;

  @ApiProperty({
    type: WalkInStatusDto,
    description: 'Cuándo atiende por orden de llegada (franjas de hoy, próxima franja, etc.).',
  })
  attendance!: WalkInStatusDto;

  @ApiPropertyOptional({ type: WaitingItemDto, nullable: true })
  nowServing!: WaitingItemDto | null;

  @ApiProperty({ type: WaitingItemDto, isArray: true, description: 'Cola en orden de atención.' })
  queue!: WaitingItemDto[];

  @ApiProperty({
    type: WaitingItemDto,
    isArray: true,
    description:
      'Self check-ins esperando que el profesional los acepte. Vacío en la respuesta pública.',
  })
  pending!: WaitingItemDto[];

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: string;
}

/**
 * Alta de un cliente que llega sin turno, cargada por el profesional. O bien un
 * `personId` de su cartera, o `fullName` (+ teléfono opcional) para dar de alta
 * a alguien nuevo en el acto.
 */
export class CreateWalkInDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  staffId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  serviceId!: string;

  @ApiPropertyOptional({ description: 'person.id de un cliente ya existente.' })
  @IsOptional()
  @IsString()
  personId?: string;

  @ApiPropertyOptional({ example: 'Juan García' })
  @IsOptional()
  @IsString()
  @TitleCase()
  fullName?: string;

  @ApiPropertyOptional({ example: '2612465120', description: PHONE_DESCRIPTION })
  @IsOptional()
  @IsPhone()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;
}

/**
 * Self check-in: el cliente se anota escaneando el QR del local. Teléfono
 * obligatorio (clave de deduplicación de personas sin cuenta, igual que en la
 * reserva pública). Si está logueado, el turno se cuelga de la Person de su cuenta.
 */
export class SelfCheckInDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  serviceId!: string;

  @ApiProperty({ example: 'Juan García' })
  @IsString()
  @IsNotEmpty()
  @TitleCase()
  fullName!: string;

  @ApiProperty({ example: '2612465120', description: PHONE_DESCRIPTION })
  @IsPhone()
  phone!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;
}

/** Resultado del self check-in: el link personal con el que el cliente sigue su turno. */
export class SelfCheckInResultDto {
  @ApiProperty({ description: 'Token del link personal: /sala/t/{token}' })
  token!: string;

  @ApiProperty({ example: 14 })
  ticketNumber!: number;

  @ApiProperty({
    type: Boolean,
    description: 'true = quedó pendiente de que el profesional lo acepte.',
  })
  needsApproval!: boolean;
}

/** Vista personal del cliente (link con token): su lugar + la cola del local. */
export class MyWaitingSpotDto {
  @ApiProperty({ type: WaitingItemDto, nullable: true })
  me!: WaitingItemDto | null;

  @ApiProperty({ type: WaitingRoomDto })
  room!: WaitingRoomDto;

  @ApiProperty({
    type: Boolean,
    description: 'true si el turno ya se completó o salió de la cola (pantalla de "listo").',
  })
  finished!: boolean;

  @ApiProperty({
    enum: ['waiting', 'done', 'no_show', 'left', 'not_in_queue'],
    description:
      'Estado del cliente: waiting = en la fila; done = lo atendieron; no_show = no vino; ' +
      'left = salió de la fila; not_in_queue = el turno existe pero todavía no llegó.',
  })
  outcome!: 'waiting' | 'done' | 'no_show' | 'left' | 'not_in_queue';

  @ApiProperty({ type: Boolean, description: 'El servidor tiene Web Push configurado.' })
  pushEnabled!: boolean;

  @ApiProperty({ type: Boolean, description: 'Este navegador/turno ya recibe avisos push.' })
  pushSubscribed!: boolean;

  @ApiProperty({ type: Number, description: 'Cuántas ausencias ("me voy y vuelvo") le quedan.' })
  awaysLeft!: number;
}

/** Cuántas atenciones definen el ETA aprendido. */
export class WaitingRoomStatsHourDto {
  @ApiProperty({ example: 11 })
  hour!: number;

  @ApiProperty({ example: 8, description: 'Llegadas en esa hora del día (en el período).' })
  arrivals!: number;
}

export class WaitingRoomStatsServiceDto {
  @ApiProperty()
  serviceName!: string;

  @ApiProperty()
  count!: number;

  @ApiProperty({ description: 'Minutos reales promedio de atención.' })
  avgServiceMinutes!: number;
}

export class WaitingRoomStatsDto {
  @ApiProperty({ example: 30 })
  days!: number;

  @ApiProperty({ description: 'Atendidos en el período.' })
  servedCount!: number;

  @ApiProperty({ description: 'No vinieron (no-show) en el período.' })
  noShowCount!: number;

  @ApiProperty({ description: 'De los atendidos, cuántos llegaron sin turno.' })
  walkInCount!: number;

  @ApiProperty({ description: 'Espera promedio (llegada → empieza la atención), en minutos.' })
  avgWaitMinutes!: number;

  @ApiProperty({ description: 'Espera máxima en el período, en minutos.' })
  maxWaitMinutes!: number;

  @ApiProperty({ description: 'Duración real promedio de una atención, en minutos.' })
  avgServiceMinutes!: number;

  @ApiProperty({ type: WaitingRoomStatsHourDto, isArray: true })
  byHour!: WaitingRoomStatsHourDto[];

  @ApiProperty({ type: Number, isArray: true, description: 'Las 3 horas con más llegadas.' })
  peakHours!: number[];

  @ApiProperty({ type: WaitingRoomStatsServiceDto, isArray: true })
  byService!: WaitingRoomStatsServiceDto[];
}

export class MoveInQueueDto {
  @ApiProperty({ enum: ['up', 'down'] })
  @IsIn(['up', 'down'])
  direction!: 'up' | 'down';
}

export class SetPriorityDto {
  @ApiProperty()
  @IsBoolean()
  priority!: boolean;
}

/** "Me voy y vuelvo": minutos de ausencia (tope 15). */
export class AwayDto {
  @ApiPropertyOptional({ example: 10, default: 10, minimum: 1, maximum: 15 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(15)
  minutes?: number;
}

export class LeaveResultDto {
  @ApiProperty({
    type: Boolean,
    description:
      'true = tenía turno agendado: sale de la fila pero el turno se conserva. ' +
      'false = llegó sin turno: se anuló.',
  })
  keptAppointment!: boolean;
}

export class PushStatusDto {
  @ApiProperty({ description: 'El servidor tiene Web Push configurado.' })
  enabled!: boolean;

  @ApiProperty({ description: 'Este turno ya tiene un navegador suscripto.' })
  subscribed!: boolean;
}
