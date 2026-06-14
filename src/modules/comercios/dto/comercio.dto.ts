import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  MinLength,
} from 'class-validator';

import { TitleCase } from '@/common/decorators/title-case.decorator';

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export class CreateComercioDto {
  @ApiProperty({ example: 'Peluquería Centro' })
  @IsString()
  @IsNotEmpty()
  @TitleCase()
  name!: string;

  @ApiProperty({ example: 'peluqueria-centro', description: 'slug único para /r/:slug' })
  @IsString()
  @Matches(SLUG_REGEX, { message: 'slug debe ser kebab-case (a-z, 0-9, guiones)' })
  slug!: string;

  @ApiPropertyOptional({ example: 'Belgrano 245, Costa de Araujo, Mendoza' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ example: 'America/Argentina/Buenos_Aires' })
  @IsOptional()
  @IsString()
  timezone?: string;
}

export class UpdateComercioDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @TitleCase()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  timezone?: string;
}

/** El profesional edita SU membresía en un comercio (p.ej. su dirección propia). */
export class UpdateMembershipDto {
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Dirección propia en este comercio. null/"" = usa la del comercio (fallback).',
  })
  @IsOptional()
  @IsString()
  address?: string | null;

  @ApiPropertyOptional({
    type: Number,
    example: 8,
    description:
      'Anticipación mínima de reserva, en horas. Un cliente solo puede reservar un turno que empiece al menos estas horas en el futuro. 0 = sin restricción.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(720)
  minBookingHours?: number;
}

export class InviteProfessionalDto {
  @ApiProperty({ example: 'profesional@mail.com' })
  @IsEmail()
  email!: string;
}

export class AcceptInvitationDto {
  @ApiProperty({ description: 'token recibido en el email de invitación' })
  @IsString()
  @IsNotEmpty()
  token!: string;
}

/** Admin crea una cuenta comercial + su comercio. */
export class CreateComercialDto {
  @ApiProperty({ example: 'comercial@peluqueria.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty({ example: 'Peluquería Centro' })
  @IsString()
  @IsNotEmpty()
  @TitleCase()
  comercioName!: string;

  @ApiProperty({ example: 'peluqueria-centro' })
  @IsString()
  @Matches(SLUG_REGEX, { message: 'slug debe ser kebab-case (a-z, 0-9, guiones)' })
  slug!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  timezone?: string;
}
