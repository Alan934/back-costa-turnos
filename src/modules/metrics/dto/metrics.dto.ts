import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export enum MetricsRange {
  Week = 'week',
  Month = 'month',
}

/** Período (semana/mes y cuántos hacia atrás). */
export class MetricsPeriodQueryDto {
  @ApiProperty({ enum: MetricsRange, enumName: 'MetricsRange', required: false, default: 'week' })
  @IsOptional()
  @IsEnum(MetricsRange)
  range?: MetricsRange;

  @ApiPropertyOptional({
    type: Number,
    default: 0,
    minimum: 0,
    maximum: 120,
    description:
      'Cuántos períodos hacia atrás: 0 = semana/mes actual, 1 = la semana/el mes anterior, etc.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(120)
  offset?: number;
}

export class MetricsQueryDto extends MetricsPeriodQueryDto {
  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    description:
      'Solo lo que pasó en este comercio. Sin valor = todos los comercios del profesional.',
  })
  @IsOptional()
  @IsUUID()
  comercioId?: string;
}

export class MetricsPeriodDto {
  @ApiProperty({ example: '2026-11-09', description: 'Primer día del período (YYYY-MM-DD).' })
  from!: string;
  @ApiProperty({ example: '2026-11-15', description: 'Último día del período (YYYY-MM-DD).' })
  to!: string;
  @ApiProperty({
    example: '2026-11-11',
    description:
      'Hasta qué día se midió. En el período en curso es hoy; en uno pasado coincide con `to`.',
  })
  until!: string;
  @ApiProperty({ type: Boolean, description: 'Es la semana/el mes en curso.' })
  isCurrent!: boolean;
}

export class AttendanceByDayDto {
  @ApiProperty({ example: '2026-11-09' })
  date!: string;
  @ApiProperty({ example: 'Lun 9' })
  label!: string;
  @ApiProperty({ type: Number })
  atendidos!: number;
  @ApiProperty({ type: Number })
  cancelados!: number;
  @ApiProperty({ type: Number, description: 'Turnos a los que el cliente no vino.' })
  ausentes!: number;
}

export class NewVsReturningDto {
  @ApiProperty({ type: Number, description: 'Atendidos por primera vez en el período.' })
  nuevos!: number;
  @ApiProperty({ type: Number, description: 'Atendidos que ya habían venido antes.' })
  recurrentes!: number;
}

export class PeakHourDto {
  @ApiProperty({ example: '09h' })
  hour!: string;
  @ApiProperty({ type: Number })
  turnos!: number;
}

export class IncomeByDayDto {
  @ApiProperty({ example: '2026-11-09' })
  date!: string;
  @ApiProperty({ example: 'Lun 9' })
  label!: string;
  @ApiProperty({ type: Number, description: 'Cobrado ese día, en centavos (sin IVA).' })
  cents!: number;
}

export class ServiceMetricsDto {
  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  serviceId!: string | null;
  @ApiProperty({ example: 'Corte de pelo' })
  name!: string;
  @ApiProperty({ type: Number, description: 'Turnos atendidos de este servicio.' })
  attended!: number;
  @ApiProperty({
    type: Number,
    description: 'Valor de lo atendido según el precio del servicio, en centavos.',
  })
  billedCents!: number;
}

export class MetricsTotalsDto {
  @ApiProperty({ type: Number, description: 'Turnos del período (cualquier estado).' })
  appointments!: number;
  @ApiProperty({ type: Number, description: 'Turnos atendidos (terminados).' })
  attended!: number;
  @ApiProperty({ type: Number })
  cancelled!: number;
  @ApiProperty({ type: Number, description: 'Turnos a los que el cliente no vino.' })
  noShow!: number;
  @ApiProperty({
    type: Number,
    description: 'Proporción 0..1 de ausencias: no vinieron / (atendidos + no vinieron).',
  })
  noShowRate!: number;
  @ApiProperty({
    type: Number,
    description: 'Cobrado en el período (pagos cobrados, por fecha de cobro, sin IVA).',
  })
  incomeCents!: number;
  @ApiProperty({
    type: Number,
    description: 'Valor de lo atendido en el período según el precio de cada servicio.',
  })
  billedCents!: number;
  @ApiProperty({ type: Number, description: 'Facturado / atendidos, en centavos.' })
  averageTicketCents!: number;
  @ApiProperty({ type: Number })
  newClients!: number;
  @ApiProperty({ type: Number })
  returningClients!: number;
  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description:
      'Proporción 0..1 de la agenda reservada (minutos reservados / minutos de atención con turno). Null si no hay horarios con turno.',
  })
  occupancyRate!: number | null;
  @ApiProperty({ type: Number })
  bookedMinutes!: number;
  @ApiProperty({ type: Number })
  availableMinutes!: number;
  @ApiProperty({ type: Number, description: 'Turnos que el cliente reservó solo, online.' })
  onlineBookings!: number;
}

export class PendingMetricsDto {
  @ApiProperty({
    type: Number,
    description: 'Efectivo/transferencia pendiente de cobro (pendiente + pagaré), a hoy.',
  })
  cashCents!: number;
  @ApiProperty({ type: Number })
  cashCount!: number;
  @ApiProperty({
    type: Number,
    description: 'Turnos ya pasados que siguen sin marcarse como atendidos o ausentes.',
  })
  unclosedAppointments!: number;
}

export class AtRiskClientDto {
  @ApiProperty({ format: 'uuid', description: 'Id del cliente (ficha) del profesional.' })
  clientId!: string;
  @ApiProperty({ format: 'uuid' })
  personId!: string;
  @ApiProperty()
  fullName!: string;
  @ApiPropertyOptional({ type: String, nullable: true })
  phone!: string | null;
  @ApiProperty({ example: 'hace 2 meses' })
  lastVisitLabel!: string;
  @ApiProperty({ type: Number })
  daysSinceLastVisit!: number;
  @ApiProperty({ type: Number, description: 'Veces que fue atendido.' })
  visits!: number;
}

export class PaymentMethodMetricsDto {
  @ApiProperty({ enum: ['cash', 'mercadopago', 'transfer'] })
  method!: string;
  @ApiProperty({ type: Number })
  count!: number;
  @ApiProperty({ type: Number, description: 'Cobrado por este medio, sin IVA, en centavos.' })
  cents!: number;
  @ApiProperty({
    type: Number,
    description: 'IVA que pagó el cliente encima (solo Mercado Pago; cubre la comisión).',
  })
  vatCents!: number;
}

export class CancellationReasonMetricsDto {
  @ApiProperty({ enum: ['client', 'professional', 'bumped', 'no_show', 'other'] })
  reason!: string;
  @ApiProperty({ type: Number })
  count!: number;
}

export class BookingChannelsDto {
  @ApiProperty({ type: Number, description: 'Reservados por el cliente con el link (online).' })
  online!: number;
  @ApiProperty({ type: Number, description: 'Cargados a mano por el profesional.' })
  manual!: number;
  @ApiProperty({ type: Number, description: 'Llegaron sin turno a la sala de espera.' })
  walkIn!: number;
}

export class WaitingRoomMetricsDto {
  @ApiProperty({ type: Number, description: 'Personas que pasaron por la sala de espera.' })
  checkedIn!: number;
  @ApiProperty({ type: Number, description: 'Espera promedio (llegada → empieza), en minutos.' })
  avgWaitMinutes!: number;
  @ApiProperty({ type: Number })
  maxWaitMinutes!: number;
  @ApiProperty({ type: Number, description: 'Duración real promedio de la atención, en minutos.' })
  avgServiceMinutes!: number;
  @ApiProperty({ type: Number, description: 'De los atendidos, cuántos llegaron sin turno.' })
  walkInsAttended!: number;
}

export class RetainedDepositsDto {
  @ApiProperty({ type: Number, description: 'Señas cobradas de turnos a los que no vinieron.' })
  cents!: number;
  @ApiProperty({ type: Number })
  count!: number;
}

export class MetricsOverviewDto {
  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'Comercio filtrado, o null si son todos.',
  })
  comercioId!: string | null;
  @ApiProperty({ enum: MetricsRange, enumName: 'MetricsRange' })
  range!: MetricsRange;
  @ApiProperty({ type: Number })
  offset!: number;
  @ApiProperty({ type: MetricsPeriodDto })
  period!: MetricsPeriodDto;
  @ApiProperty({
    type: MetricsPeriodDto,
    description: 'Período anterior, recortado al mismo tramo transcurrido para comparar parejo.',
  })
  previousPeriod!: MetricsPeriodDto;
  @ApiProperty({ type: MetricsTotalsDto })
  totals!: MetricsTotalsDto;
  @ApiProperty({ type: MetricsTotalsDto })
  previousTotals!: MetricsTotalsDto;
  @ApiProperty({ type: AttendanceByDayDto, isArray: true })
  attendanceByDay!: AttendanceByDayDto[];
  @ApiProperty({ type: IncomeByDayDto, isArray: true })
  incomeByDay!: IncomeByDayDto[];
  @ApiProperty({ type: PeakHourDto, isArray: true })
  peakHours!: PeakHourDto[];
  @ApiProperty({ type: ServiceMetricsDto, isArray: true })
  services!: ServiceMetricsDto[];
  @ApiProperty({ type: NewVsReturningDto })
  newVsReturning!: NewVsReturningDto;
  @ApiProperty({
    type: PendingMetricsDto,
    description: 'Pendientes a hoy (no dependen del período).',
  })
  pending!: PendingMetricsDto;
  @ApiProperty({ type: AtRiskClientDto, isArray: true })
  atRiskClients!: AtRiskClientDto[];
  @ApiProperty({ type: Number, description: 'Total de clientes que dejaron de venir.' })
  atRiskTotal!: number;
  @ApiProperty({ type: PaymentMethodMetricsDto, isArray: true })
  byPaymentMethod!: PaymentMethodMetricsDto[];
  @ApiProperty({ type: CancellationReasonMetricsDto, isArray: true })
  cancellationsByReason!: CancellationReasonMetricsDto[];
  @ApiProperty({ type: BookingChannelsDto })
  bookingChannels!: BookingChannelsDto;
  @ApiProperty({ type: WaitingRoomMetricsDto })
  waitingRoom!: WaitingRoomMetricsDto;
  @ApiProperty({ type: RetainedDepositsDto })
  retainedDeposits!: RetainedDepositsDto;
}

// ---- Métricas del equipo (vista del dueño del comercio) ----

export class TeamMemberMetricsDto {
  @ApiProperty({ format: 'uuid' })
  membershipId!: string;
  @ApiProperty({ example: 'Peluquería Juan' })
  professionalName!: string;
  @ApiProperty({
    type: Boolean,
    description: 'El profesional comparte su plata con el comercio (si no, los montos son null).',
  })
  sharesIncome!: boolean;
  @ApiProperty({ type: Number })
  attended!: number;
  @ApiProperty({ type: Number })
  previousAttended!: number;
  @ApiProperty({ type: Number })
  cancelled!: number;
  @ApiProperty({ type: Number })
  noShow!: number;
  @ApiProperty({ type: Number, description: 'Proporción 0..1 de ausencias.' })
  noShowRate!: number;
  @ApiProperty({ type: Number })
  previousNoShowRate!: number;
  @ApiPropertyOptional({ type: Number, nullable: true })
  occupancyRate!: number | null;
  @ApiPropertyOptional({ type: Number, nullable: true })
  previousOccupancyRate!: number | null;
  @ApiProperty({ type: Number })
  bookedMinutes!: number;
  @ApiProperty({ type: Number })
  availableMinutes!: number;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Servicio más atendido.' })
  topServiceName!: string | null;
  @ApiPropertyOptional({ type: Number, nullable: true, description: 'Null si no comparte.' })
  incomeCents!: number | null;
  @ApiPropertyOptional({ type: Number, nullable: true, description: 'Null si no comparte.' })
  previousIncomeCents!: number | null;
  @ApiPropertyOptional({ type: Number, nullable: true, description: 'Null si no comparte.' })
  billedCents!: number | null;
  @ApiPropertyOptional({ type: Number, nullable: true, description: 'Null si no comparte.' })
  averageTicketCents!: number | null;
}

export class TeamTotalsDto {
  @ApiProperty({ type: Number })
  attended!: number;
  @ApiProperty({ type: Number })
  previousAttended!: number;
  @ApiProperty({ type: Number })
  noShow!: number;
  @ApiProperty({ type: Number })
  noShowRate!: number;
  @ApiPropertyOptional({ type: Number, nullable: true })
  occupancyRate!: number | null;
  @ApiProperty({ type: Number, description: 'Cuántos profesionales comparten su plata.' })
  sharingCount!: number;
}

export class ComercioTeamMetricsDto {
  @ApiProperty({ enum: MetricsRange, enumName: 'MetricsRange' })
  range!: MetricsRange;
  @ApiProperty({ type: Number })
  offset!: number;
  @ApiProperty({ type: MetricsPeriodDto })
  period!: MetricsPeriodDto;
  @ApiProperty({ type: MetricsPeriodDto })
  previousPeriod!: MetricsPeriodDto;
  @ApiProperty({ type: TeamTotalsDto })
  team!: TeamTotalsDto;
  @ApiProperty({ type: TeamMemberMetricsDto, isArray: true })
  members!: TeamMemberMetricsDto[];
}
