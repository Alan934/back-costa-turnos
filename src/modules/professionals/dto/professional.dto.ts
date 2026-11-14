import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { DepositMode } from '@/common/enums';
import { IsEnum } from 'class-validator';
import { TitleCase } from '@/common/decorators/title-case.decorator';
import type { PublicPageSettings } from '../entities/professional.entity';

/** Respuesta de GET /professionals/slug-availability. */
export class SlugAvailabilityDto {
  @ApiProperty({ example: 'mi-peluqueria', description: 'slug consultado (normalizado)' })
  slug!: string;

  @ApiProperty({ type: Boolean, description: 'false si no es kebab-case (a-z, 0-9, guiones)' })
  valid!: boolean;

  @ApiProperty({ type: Boolean, description: 'true si nadie lo usa (profesional ni comercio)' })
  available!: boolean;

  @ApiProperty({
    type: String,
    isArray: true,
    example: ['mi-peluqueria-2', 'mi-peluqueria-3'],
    description: 'alternativas libres cuando está tomado',
  })
  suggestions!: string[];
}

export class OnboardProfessionalDto {
  @ApiProperty({ example: 'Peluqueria Mi Pueblo' })
  @IsString()
  @IsNotEmpty()
  @TitleCase()
  businessName!: string;

  @ApiProperty({ example: 'mi-peluqueria', description: 'slug unico para /r/:slug' })
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'slug debe ser kebab-case (a-z, 0-9, guiones)',
  })
  slug!: string;

  @ApiPropertyOptional({ example: 'America/Argentina/Buenos_Aires' })
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiPropertyOptional({ example: 'Belgrano 245, Costa de Araujo, Mendoza' })
  @IsOptional()
  @IsString()
  address?: string;
}

export class NotificationPrefsDto {
  @ApiPropertyOptional({ type: Boolean, description: 'Avisos por email (default: activado)' })
  @IsOptional()
  @IsBoolean()
  email?: boolean;

  @ApiPropertyOptional({ type: Boolean, description: 'Avisos en el celular (default: activado)' })
  @IsOptional()
  @IsBoolean()
  push?: boolean;
}

export class UpdateProfessionalDto {
  @ApiPropertyOptional({ type: NotificationPrefsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => NotificationPrefsDto)
  notificationPrefs?: NotificationPrefsDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @TitleCase()
  businessName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiPropertyOptional({ example: 'Belgrano 245, Costa de Araujo, Mendoza' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ enum: DepositMode })
  @IsOptional()
  @IsEnum(DepositMode)
  defaultDepositMode?: DepositMode;

  @ApiPropertyOptional({
    example: 4.5,
    description: 'IVA por defecto (%) cobrado al cliente en pagos por Mercado Pago (0–100).',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  defaultVatPercent?: number;

  @ApiPropertyOptional({
    type: Boolean,
    description: 'true = el IVA se le suma al cliente; false = el profesional lo absorbe.',
  })
  @IsOptional()
  @IsBoolean()
  vatChargedToClient?: boolean;

  @ApiPropertyOptional({ example: 24 })
  @IsOptional()
  @IsInt()
  @Min(0)
  cancellationWindowHours?: number;

  @ApiPropertyOptional({
    example: 24,
    description:
      'Horas mínimas antes del turno hasta las que el cliente puede reprogramar. 0 = sin restricción.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  rescheduleWindowHours?: number;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    description:
      'Branding de la página pública (logoFileId, primaryColor, description, bio, phone, etc.). Se reemplaza completo.',
  })
  @IsOptional()
  @IsObject()
  publicPageSettings?: PublicPageSettings;
}

export class CreateStaffDto {
  @ApiProperty({ example: 'Sillon 1 - Maria' })
  @IsString()
  @IsNotEmpty()
  @TitleCase()
  displayName!: string;
}

export class UpdateStaffDto extends PartialType(CreateStaffDto) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
