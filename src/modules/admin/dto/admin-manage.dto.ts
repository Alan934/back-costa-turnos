import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString, IsUUID, Matches } from 'class-validator';

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
  fullName!: string;

  @ApiProperty({ required: false, example: 'maria@mail.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiProperty({ required: false, example: '+54 9 11 5555-5555' })
  @IsOptional()
  @IsString()
  phone?: string;
}
