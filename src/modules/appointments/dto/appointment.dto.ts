import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsEmail, IsEnum, IsISO8601, IsOptional, IsString, IsNotEmpty, IsUUID } from 'class-validator';
import { CancellationReason, PaymentMethod, PaymentOption } from '@/common/enums';
import { IsPhone, PHONE_DESCRIPTION } from '@/common/decorators/phone.decorator';
import { TitleCase } from '@/common/decorators/title-case.decorator';

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

export class CancelAppointmentDto {
  @ApiPropertyOptional({ enum: CancellationReason })
  @IsOptional()
  @IsEnum(CancellationReason)
  reason?: CancellationReason;
}
