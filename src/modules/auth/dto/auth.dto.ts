import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Matches,
  MinLength,
} from 'class-validator';
import { AppRole } from '@/common/enums';
import { TitleCase } from '@/common/decorators/title-case.decorator';

export class RegisterDto {
  @ApiProperty({ example: 'dueno@peluqueria.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'super-secreta-123', minLength: 8 })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty({ example: 'Juan Perez' })
  @IsString()
  @IsNotEmpty()
  @TitleCase()
  fullName!: string;
}

/** Registro de profesional (trabajador): cuenta + onboarding. */
export class RegisterProfessionalDto extends RegisterDto {
  @ApiProperty({ example: 'Juan Perez Estilista', description: 'nombre visible del profesional' })
  @IsString()
  @IsNotEmpty()
  @TitleCase()
  businessName!: string;

  @ApiProperty({ example: 'juan-estilista', description: 'slug único para su página propia' })
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

export class LoginDto {
  @ApiProperty({ example: 'dueno@peluqueria.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'super-secreta-123' })
  @IsString()
  @IsNotEmpty()
  password!: string;
}

export class RefreshDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}

export class RequestCodeDto {
  @ApiProperty({ example: 'dueno@peluqueria.com' })
  @IsEmail()
  email!: string;
}

export class ClaimAccountDto {
  @ApiProperty({ example: 'cliente@mail.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @Length(6, 6)
  code!: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  password!: string;
}

export class VerifyEmailDto {
  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @Length(6, 6)
  code!: string;
}

export class ResetPasswordDto {
  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @Length(6, 6)
  code!: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  newPassword!: string;
}

export class AuthTokensDto {
  @ApiProperty()
  accessToken!: string;

  @ApiProperty()
  refreshToken!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  expiresIn?: string;
}

/** Respuesta de GET /auth/me: datos del usuario autenticado. */
export class AuthMeDto {
  @ApiProperty({ format: 'uuid', description: 'account.id' })
  sub!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty({ type: Boolean, description: 'true si verificó su email' })
  emailVerified!: boolean;

  @ApiProperty({ enum: AppRole, enumName: 'AppRole', isArray: true })
  roles!: AppRole[];

  @ApiProperty({ type: Boolean })
  isPlatformAdmin!: boolean;

  @ApiPropertyOptional({ format: 'uuid', description: 'professional (trabajador)' })
  professionalId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  staffId?: string;

  @ApiPropertyOptional({
    type: String,
    isArray: true,
    description: 'comercios que administra como comercial (+ su comercio-de-uno)',
  })
  comercioIds?: string[];
}
