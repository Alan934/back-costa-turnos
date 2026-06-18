import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { AppointmentStatus, PaymentStatus } from '@/common/enums';
import { MetricsRange } from '@/modules/metrics/dto/metrics.dto';

export class CashClosingQueryDto {
  @ApiPropertyOptional({
    enum: MetricsRange,
    enumName: 'MetricsRange',
    default: MetricsRange.Week,
    description: 'Período para el total cobrado en efectivo (por fecha de cobro).',
  })
  @IsOptional()
  @IsEnum(MetricsRange)
  range?: MetricsRange;
}

/** Turno pasado que el profesional no cerró (sigue confirmado / en progreso). */
export class PendingCompletionDto {
  @ApiProperty({ format: 'uuid' })
  appointmentId!: string;
  @ApiProperty()
  personName!: string;
  @ApiProperty()
  serviceName!: string;
  @ApiProperty({ type: String, format: 'date-time' })
  startAt!: string;
  @ApiProperty({ type: String, format: 'date-time' })
  endAt!: string;
  @ApiProperty({ enum: AppointmentStatus, enumName: 'AppointmentStatus' })
  status!: AppointmentStatus;
}

/** Pago en efectivo que el profesional todavía no cobró (pendiente o pagaré). */
export class PendingCashDto {
  @ApiProperty({ format: 'uuid' })
  paymentId!: string;
  @ApiProperty({ format: 'uuid', nullable: true })
  appointmentId!: string | null;
  @ApiProperty()
  personName!: string;
  @ApiProperty()
  serviceName!: string;
  @ApiProperty({ type: Number })
  amountCents!: number;
  @ApiProperty({
    enum: PaymentStatus,
    enumName: 'PaymentStatus',
    description: 'pending = aún sin cerrar; deferred = pagaré (el cliente quedó debiendo).',
  })
  status!: PaymentStatus;
  @ApiProperty({ type: String, nullable: true, description: 'Fecha del turno asociado.' })
  appointmentStartAt!: string | null;
  @ApiProperty({ type: String, nullable: true })
  note!: string | null;
}

export class CashCollectedDto {
  @ApiProperty({ type: Number })
  count!: number;
  @ApiProperty({ type: Number, description: 'Total cobrado en efectivo en el período (centavos).' })
  totalCents!: number;
}

export class CashClosingDto {
  @ApiProperty({
    type: PendingCompletionDto,
    isArray: true,
    description: 'Turnos pasados sin marcar como atendidos.',
  })
  pendingCompletion!: PendingCompletionDto[];

  @ApiProperty({
    type: PendingCashDto,
    isArray: true,
    description: 'Pagos en efectivo sin cobrar (pendientes y pagarés).',
  })
  pendingCash!: PendingCashDto[];

  @ApiProperty({ type: Number, description: 'Total de efectivo pendiente de cobro (centavos).' })
  pendingCashCents!: number;

  @ApiProperty({ type: CashCollectedDto })
  collected!: CashCollectedDto;
}
