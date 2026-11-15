import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsInt,
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  IsNotEmpty,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { CancellationReason, CashOutcome, PaymentMethod, PaymentOption } from '@/common/enums';
import { IsPhone, PHONE_DESCRIPTION } from '@/common/decorators/phone.decorator';
import { TitleCase } from '@/common/decorators/title-case.decorator';
import { Payment } from '@/modules/payments/entities/payment.entity';
import { Appointment } from '../entities/appointment.entity';

/** Datos del cliente: o un personId existente, o info para find-or-create. */
export class ClientRefDto {
  @ApiPropertyOptional({ description: 'person.id existente' })
  @IsOptional()
  @IsString()
  personId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @TitleCase()
  fullName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: '2612465120', description: PHONE_DESCRIPTION })
  @IsOptional()
  @IsPhone()
  phone?: string;
}

export class BookAppointmentDto extends ClientRefDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  staffId!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  serviceId!: string;

  @ApiProperty({ example: '2026-06-10T13:00:00Z' })
  @IsISO8601()
  startAt!: string;

  @ApiPropertyOptional({
    type: [String],
    description: 'IDs de servicios adicionales habilitados por reglas de combinación',
  })
  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  addonServiceIds?: string[];
}

export class BookWithDepositDto extends BookAppointmentDto {
  @ApiProperty({ enum: PaymentMethod, example: PaymentMethod.MercadoPago })
  @IsEnum(PaymentMethod)
  method!: PaymentMethod;

  /** Qué paga: seña o el total. Default: deposit (seña). */
  @ApiPropertyOptional({
    enum: PaymentOption,
    enumName: 'PaymentOption',
    default: PaymentOption.Deposit,
    description: 'deposit = seña, full = pago completo',
  })
  @IsOptional()
  @IsEnum(PaymentOption)
  paymentOption?: PaymentOption;
}

/**
 * Reserva pública en un comercio. El profesional sale del membershipId de la ruta;
 * el staff se resuelve solo. Teléfono obligatorio (clave de deduplicación primaria
 * para clientes sin cuenta); email opcional pero mejora el reconocimiento si el
 * número cambia en el futuro.
 */
export class PublicBookDto {
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

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  serviceId!: string;

  @ApiProperty({ example: '2026-06-10T13:00:00Z' })
  @IsISO8601()
  startAt!: string;

  @ApiPropertyOptional({
    type: [String],
    description: 'IDs de servicios adicionales habilitados por reglas de combinación',
  })
  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  addonServiceIds?: string[];
}

export class PublicBookWithDepositDto extends PublicBookDto {
  @ApiProperty({ enum: PaymentMethod, example: PaymentMethod.MercadoPago })
  @IsEnum(PaymentMethod)
  method!: PaymentMethod;

  @ApiPropertyOptional({
    enum: PaymentOption,
    enumName: 'PaymentOption',
    default: PaymentOption.Deposit,
    description: 'deposit = seña, full = pago completo',
  })
  @IsOptional()
  @IsEnum(PaymentOption)
  paymentOption?: PaymentOption;
}

export class ConfirmDepositDto {
  @ApiProperty({ enum: PaymentMethod })
  @IsEnum(PaymentMethod)
  method!: PaymentMethod;
}

/**
 * Cierre del turno. Para turnos con pago en efectivo pendiente, el profesional
 * confirma el cobro al finalizar: `collected` = recibió el efectivo;
 * `deferred` = no cobró / el cliente pagará después (pagaré). Si se omite, el
 * pago queda pendiente y aparece en el cierre de caja.
 */
export class CompleteAppointmentDto {
  @ApiPropertyOptional({ enum: CashOutcome, enumName: 'CashOutcome' })
  @IsOptional()
  @IsEnum(CashOutcome)
  cashOutcome?: CashOutcome;

  @ApiPropertyOptional({ description: 'Motivo del pagaré (si cashOutcome=deferred)' })
  @IsOptional()
  @IsString()
  note?: string;
}

export class CancelAppointmentDto {
  @ApiPropertyOptional({ enum: CancellationReason })
  @IsOptional()
  @IsEnum(CancellationReason)
  reason?: CancellationReason;

  @ApiPropertyOptional({
    description: 'Turno fijo: cancela también los turnos siguientes de la misma serie',
  })
  @IsOptional()
  @IsBoolean()
  includeFollowing?: boolean;
}

/** Turnos fijos: el mismo turno repetido cada `everyWeeks` semanas, `count` veces en total. */
export class BookSeriesDto extends BookAppointmentDto {
  @ApiProperty({ minimum: 1, maximum: 4, example: 1, description: 'Cada cuántas semanas' })
  @IsInt()
  @Min(1)
  @Max(4)
  everyWeeks!: number;

  @ApiProperty({
    minimum: 2,
    maximum: 52,
    example: 8,
    description: 'Cuántos turnos en total (incluye el primero)',
  })
  @IsInt()
  @Min(2)
  @Max(52)
  count!: number;
}

/** Fecha de un turno fijo que no se pudo dar, con el motivo para mostrarle al profesional. */
export class SkippedOccurrenceDto {
  @ApiProperty({ example: '2026-12-08T21:00:00.000Z' })
  startAt!: string;

  @ApiProperty({ example: 'Feriado: Inmaculada Concepción' })
  reason!: string;
}

export class BookSeriesResultDto {
  @ApiProperty({ description: 'Id que comparten los turnos de la serie' })
  seriesId!: string;

  @ApiProperty({ type: [Appointment] })
  created!: Appointment[];

  @ApiProperty({ type: [SkippedOccurrenceDto] })
  skipped!: SkippedOccurrenceDto[];
}

/** El profesional marca que el cliente confirmó que va (o lo desmarca). */
export class SetClientConfirmedDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  confirmed!: boolean;
}

/** El profesional cambia el horario de un turno (mismo cliente, servicio y duración). */
export class RescheduleAppointmentDto {
  @ApiProperty({ example: '2026-06-10T13:00:00Z' })
  @IsISO8601()
  startAt!: string;

  @ApiPropertyOptional({
    default: true,
    description: 'Mandarle al cliente un email con el horario nuevo (si tiene email)',
  })
  @IsOptional()
  @IsBoolean()
  notifyClient?: boolean;
}

/**
 * Respuesta de los endpoints book-with-deposit.
 * - `appointment`: el turno creado. Es `null` con method=mercadopago (el turno se crea
 *   recién al acreditarse el pago vía webhook). Trae `isProvisional` y, en reservas
 *   "cualquiera", `professionalDisplayName` (el profesional asignado).
 * - `payment`: el pago. `status='pending'` en efectivo/transferencia (lo confirma el
 *   profesional) y en mercadopago hasta que se acredita.
 * - `mpInitPoint`: solo con method=mercadopago, URL de checkout a la que redirigir.
 */
export class BookWithDepositResultDto {
  @ApiPropertyOptional({
    type: Appointment,
    nullable: true,
    description: 'Turno creado. null con method=mercadopago (se crea al acreditarse el pago).',
  })
  appointment!: Appointment | null;

  @ApiProperty({ type: Payment })
  payment!: Payment;

  @ApiPropertyOptional({
    type: String,
    description: 'Solo con method=mercadopago: URL de checkout a la que redirigir al cliente.',
  })
  mpInitPoint?: string;
}
