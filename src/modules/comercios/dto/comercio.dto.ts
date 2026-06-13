import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString, Matches, MinLength } from 'class-validator';

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export class CreateComercioDto {
  @ApiProperty({ example: 'Peluquería Centro' })
  @IsString()
  @IsNotEmpty()
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
