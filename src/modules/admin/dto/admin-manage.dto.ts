import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString, IsUUID, Matches } from 'class-validator';
import { IsPhone, PHONE_DESCRIPTION } from '@/common/decorators/phone.decorator';
import { TitleCase } from '@/common/decorators/title-case.decorator';

/**
 * Alta de un profesional por el admin: crea la cuenta (sin reclamar) y el
 * negocio. El profesional luego reclama la cuenta con codigo y setea password.
 */
export class AdminCreateProfessionalDto {
  @ApiProperty({ example: 'dueno@peluqueria.com' })
  @IsEmail()
  email!: string;

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
}

/** Alta de un cliente por el admin, asignado a un profesional (tenant) destino. */
export class AdminCreateClientDto {
  @ApiProperty({ format: 'uuid', description: 'professional (tenant) al que se asigna el cliente' })
  @IsUUID()
  professionalId!: string;

  @ApiProperty({ example: 'Maria Lopez' })
  @IsString()
  @IsNotEmpty()
  @TitleCase()
  fullName!: string;

  @ApiProperty({ required: false, example: 'maria@mail.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiProperty({ required: false, example: '2612465120', description: PHONE_DESCRIPTION })
  @IsOptional()
  @IsPhone()
  phone?: string;
}
