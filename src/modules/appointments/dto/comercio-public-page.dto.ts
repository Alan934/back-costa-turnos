import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Service } from '@/modules/catalog/entities/service.entity';

/** Un profesional del comercio en la página pública (para elegir con quién reservar). */
export class PublicProfessionalDto {
  @ApiProperty({ format: 'uuid', description: 'Membership id: usar para servicios/slots/booking.' })
  membershipId!: string;

  @ApiProperty({ format: 'uuid' })
  professionalId!: string;

  @ApiProperty({ example: 'Lucía Pérez' })
  displayName!: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Dirección donde atiende: la propia de la membresía o la del comercio (fallback).',
  })
  address!: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Descripción/bio del profesional (publicPageSettings.bio).',
  })
  bio!: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Teléfono/WhatsApp del profesional (publicPageSettings.phone).',
  })
  phone!: string | null;
}

/** Respuesta de GET /r/:slug: la página pública del COMERCIO. */
export class ComercioPublicPageDto {
  @ApiProperty({ format: 'uuid' })
  comercioId!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  slug!: string;

  @ApiProperty()
  timezone!: string;

  @ApiPropertyOptional({ type: String, nullable: true, description: 'Dirección del comercio.' })
  address!: string | null;

  @ApiProperty({ type: Boolean, description: 'true = comercio-de-uno (un solo profesional).' })
  isPersonal!: boolean;

  @ApiProperty({ type: 'object', additionalProperties: true })
  settings!: Record<string, unknown>;

  @ApiProperty({
    type: PublicProfessionalDto,
    isArray: true,
    description: 'Profesionales activos del comercio. Si hay uno solo, autoseleccionar.',
  })
  professionals!: PublicProfessionalDto[];
}

/** Un profesional que ofrece un servicio (en el catálogo del comercio). */
export class PublicServiceProfessionalDto {
  @ApiProperty({
    format: 'uuid',
    description: 'Membership id: usar para slots/booking por profesional.',
  })
  membershipId!: string;

  @ApiProperty({ format: 'uuid' })
  professionalId!: string;

  @ApiProperty({ example: 'Lucía Pérez' })
  displayName!: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Dirección donde atiende: la propia de la membresía o la del comercio (fallback).',
  })
  address!: string | null;
}

/**
 * Respuesta de GET /r/:slug/services: catálogo del comercio. Si `professionals`
 * tiene un solo elemento, el front muestra ese nombre; si hay varios, habilita la
 * opción "cualquiera".
 */
export class PublicServiceDto {
  @ApiProperty({ format: 'uuid' })
  serviceId!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ type: Number })
  durationMinutes!: number;

  @ApiProperty({ type: Number })
  priceCents!: number;

  @ApiProperty({ type: Boolean })
  allowDeposit!: boolean;

  @ApiProperty({ type: Boolean })
  allowFullPayment!: boolean;

  @ApiProperty({ type: Boolean })
  allowNoPayment!: boolean;

  @ApiPropertyOptional({ type: Number, nullable: true })
  depositAmountCents!: number | null;

  @ApiProperty({ type: PublicServiceProfessionalDto, isArray: true })
  professionals!: PublicServiceProfessionalDto[];
}

/** Respuesta de GET /r/:slug/professionals/:membershipId: servicios + ubicación del pro. */
export class PublicProfessionalDetailDto extends PublicProfessionalDto {
  @ApiProperty()
  timezone!: string;

  @ApiProperty({
    type: Service,
    isArray: true,
    description: 'Servicios activos del profesional en este comercio.',
  })
  services!: Service[];
}
