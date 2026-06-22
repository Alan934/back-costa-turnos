import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import { TitleCase } from '@/common/decorators/title-case.decorator';

export class CreateServiceDto {
  @ApiProperty({ example: 'Corte de pelo' })
  @IsString()
  @IsNotEmpty()
  @TitleCase()
  name!: string;

  @ApiPropertyOptional({
    description: 'Descripción opcional del servicio (qué incluye, qué se realiza, etc.)',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    type: [String],
    description:
      'Hasta 3 imágenes de ejemplo (object_keys obtenidos de POST /files?ownerType=service)',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3)
  @IsString({ each: true })
  imageKeys?: string[];

  @ApiPropertyOptional({
    type: [String],
    description:
      'Membresías (profesionales) que ofrecen este servicio. Requerido (≥1) al crear desde el ' +
      'comercio; en el alta del comercio-de-uno se asume el profesional logueado.',
  })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID(undefined, { each: true })
  membershipIds?: string[];

  @ApiProperty({ example: 30, description: 'duracion en minutos' })
  @IsInt()
  @Min(1)
  durationMinutes!: number;

  @ApiProperty({ example: 500000, description: 'precio (pago completo) en centavos' })
  @IsInt()
  @Min(0)
  priceCents!: number;

  // ---- Opciones de pago (checkboxes; se pueden combinar) ----
  @ApiPropertyOptional({ type: Boolean, description: 'Permitir reservar con seña' })
  @IsOptional()
  @IsBoolean()
  allowDeposit?: boolean;

  @ApiPropertyOptional({ type: Boolean, description: 'Permitir reservar con pago completo' })
  @IsOptional()
  @IsBoolean()
  allowFullPayment?: boolean;

  @ApiPropertyOptional({ type: Boolean, description: 'Permitir reservar sin pagar' })
  @IsOptional()
  @IsBoolean()
  allowNoPayment?: boolean;

  @ApiPropertyOptional({
    type: Boolean,
    description: 'Permitir reservar pagando en efectivo (precio completo, sin IVA)',
  })
  @IsOptional()
  @IsBoolean()
  allowCash?: boolean;

  @ApiPropertyOptional({
    type: Boolean,
    description: 'Permitir reservar por transferencia/QR (precio completo, sin IVA)',
  })
  @IsOptional()
  @IsBoolean()
  allowTransfer?: boolean;

  // ---- IVA (solo Mercado Pago). Enviar null para volver a heredar del profesional. ----
  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    example: 6.45,
    description: 'IVA (%) de este servicio. null = hereda el default del profesional.',
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  vatPercent?: number | null;

  @ApiPropertyOptional({
    type: Boolean,
    nullable: true,
    description: 'Si el IVA se cobra al cliente en este servicio. null = hereda del profesional.',
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsBoolean()
  vatChargedToClient?: boolean | null;

  @ApiPropertyOptional({ example: 200000, description: 'monto de la seña en centavos' })
  @IsOptional()
  @IsInt()
  @Min(0)
  depositAmountCents?: number;

  @ApiPropertyOptional({
    example: 1,
    description: 'Cuántos clientes pueden reservar el mismo horario (default 1)',
    minimum: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  capacity?: number;
}

export class UpdateServiceDto extends PartialType(CreateServiceDto) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
