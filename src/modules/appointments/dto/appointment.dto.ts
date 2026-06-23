import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsEmail,
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  IsNotEmpty,
  IsUUID,
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
