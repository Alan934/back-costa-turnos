import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString, Length, MinLength } from 'class-validator';
import { AppRole } from '@/common/enums';

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
  fullName!: string;
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

  @ApiPropertyOptional({ format: 'uuid', description: 'tenant que administra' })
  professionalId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  staffId?: string;
}
