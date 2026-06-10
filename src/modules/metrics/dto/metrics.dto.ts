import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';

export enum MetricsRange {
  Week = 'week',
  Month = 'month',
}

export class MetricsQueryDto {
  @ApiProperty({ enum: MetricsRange, enumName: 'MetricsRange', required: false, default: 'week' })
  @IsOptional()
  @IsEnum(MetricsRange)
  range?: MetricsRange;
}

export class AttendanceByDayDto {
  @ApiProperty({ example: 'Lun' })
  label!: string;
  @ApiProperty({ type: Number })
  atendidos!: number;
  @ApiProperty({ type: Number })
  cancelados!: number;
  @ApiProperty({ type: Number })
  noShow!: number;
}

export class NewVsReturningDto {
  @ApiProperty({ type: Number })
  nuevos!: number;
  @ApiProperty({ type: Number })
  recurrentes!: number;
}

export class PeakHourDto {
  @ApiProperty({ example: '09h' })
  hour!: string;
  @ApiProperty({ type: Number })
  turnos!: number;
}

export class IncomeByDayDto {
  @ApiProperty({ example: 'Lun' })
  label!: string;
  @ApiProperty({ type: Number, description: 'Ingreso del periodo en centavos' })
  cents!: number;
}

export class MetricsTotalsDto {
  @ApiProperty({ type: Number })
  appointments!: number;
  @ApiProperty({ type: Number })
  incomeCents!: number;
  @ApiProperty({ type: Number })
  newClients!: number;
  @ApiProperty({ type: Number, description: 'Proporcion 0..1 de no-show' })
  noShowRate!: number;
}

export class AtRiskClientDto {
  @ApiProperty()
  id!: string;
  @ApiProperty()
  fullName!: string;
  @ApiProperty({ example: 'hace 3 meses' })
  lastVisitLabel!: string;
}

export class MetricsOverviewDto {
  @ApiProperty({ enum: MetricsRange, enumName: 'MetricsRange' })
  range!: MetricsRange;
  @ApiProperty({ type: AttendanceByDayDto, isArray: true })
  attendanceByDay!: AttendanceByDayDto[];
  @ApiProperty({ type: NewVsReturningDto })
  newVsReturning!: NewVsReturningDto;
  @ApiProperty({ type: PeakHourDto, isArray: true })
  peakHours!: PeakHourDto[];
  @ApiProperty({ type: IncomeByDayDto, isArray: true })
  incomeByDay!: IncomeByDayDto[];
  @ApiProperty({ type: MetricsTotalsDto })
  totals!: MetricsTotalsDto;
  @ApiProperty({ type: AtRiskClientDto, isArray: true })
  atRiskClients!: AtRiskClientDto[];
}
