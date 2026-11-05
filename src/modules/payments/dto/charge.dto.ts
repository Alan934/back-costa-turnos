import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { PaymentMethod, PaymentStatus, PaymentType } from '@/common/enums';

/** Un pago del turno, tal como lo ve el profesional al cobrar. */
export class ChargePaymentDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: PaymentMethod, enumName: 'PaymentMethod' })
  method!: PaymentMethod;

  @ApiProperty({ enum: PaymentStatus, enumName: 'PaymentStatus' })
  status!: PaymentStatus;

  @ApiProperty({ enum: PaymentType, enumName: 'PaymentType' })
  type!: PaymentType;

  @ApiProperty({ description: 'Lo que pagó/paga el cliente (centavos, con IVA si es MP).' })
  amountCents!: number;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  paidAt!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  note!: string | null;

  @ApiProperty({
    description:
      'true si el profesional lo puede deshacer: solo cobros manuales (efectivo/transferencia) ' +
      'ya marcados como pagados. Un pago acreditado por Mercado Pago NO se deshace desde acá.',
  })
  revertible!: boolean;
}

/** Cuánto vale el turno, cuánto se cobró y cuánto falta. Todo en centavos. */
export class ChargeSummaryDto {
  @ApiProperty({ format: 'uuid' })
  appointmentId!: string;

  @ApiProperty()
  serviceName!: string;

  @ApiProperty({ description: 'Valor del turno sin IVA (servicio + adicionales).' })
  totalCents!: number;

  @ApiProperty({ description: 'Ya cobrado (sin IVA), sumando señas y pagos anteriores.' })
  paidCents!: number;

  @ApiProperty({
    description: 'Falta cobrar, sin IVA. Es lo que se cobra en efectivo/transferencia.',
  })
  dueCents!: number;

  @ApiProperty({
    description:
      'Lo que paga el cliente por Mercado Pago: lo que falta + IVA (si se le cobra al cliente).',
  })
  dueMpCents!: number;

  @ApiProperty({ description: 'No queda nada por cobrar.' })
  fullyPaid!: boolean;

  @ApiProperty({
    description:
      'El profesional tiene Mercado Pago conectado: se puede cobrar con QR. Si es false, ' +
      'primero tiene que conectarlo en Cobros.',
  })
  mpConnected!: boolean;

  @ApiProperty({ type: ChargePaymentDto, isArray: true })
  payments!: ChargePaymentDto[];
}

export class ChargeQrDto {
  @ApiProperty({ format: 'uuid' })
  paymentId!: string;

  @ApiProperty({ description: 'URL de checkout de Mercado Pago: es lo que se codifica en el QR.' })
  initPoint!: string;

  @ApiProperty({ description: 'Monto que va a ver el cliente al escanear (centavos).' })
  amountCents!: number;
}

/**
 * El cliente ya pagó fuera del sistema. `cash` = efectivo en el momento;
 * `transfer` = transferencia, QR de otra billetera, o lo pagó antes por su cuenta.
 */
export class MarkChargePaidDto {
  @ApiProperty({ enum: ['cash', 'transfer'] })
  @IsIn(['cash', 'transfer'])
  method!: 'cash' | 'transfer';

  @ApiPropertyOptional({
    description: 'Aclaración libre ("pagó ayer por transferencia", n° de comprobante, etc.).',
    maxLength: 300,
  })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}

export class RevertPaymentDto {
  @ApiProperty({
    description: 'Por qué se deshace. Obligatorio y queda registrado en la auditoría.',
    minLength: 3,
    maxLength: 300,
  })
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  reason!: string;
}

/** Una entrada del historial (auditoría) de un pago. */
export class PaymentAuditEntryDto {
  @ApiProperty()
  action!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Cuenta que lo hizo (null = sistema/webhook).',
  })
  accountId!: string | null;

  @ApiProperty({ type: 'object', additionalProperties: true })
  metadata!: Record<string, unknown>;
}
