import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Service, ServicePricing } from '@/modules/catalog/entities/service.entity';

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

  @ApiProperty({
    type: Boolean,
    description:
      'Si es true, una reserva sin seña con este profesional queda provisional (desplazable por ' +
      'quien pague la seña). El front lo usa para mostrar/ocultar el aviso pre-reserva. ' +
      'false = el turno sin seña queda firme.',
  })
  allowProvisionalBookings!: boolean;
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

  @ApiProperty({
    type: Boolean,
    description:
      'Si es true, una reserva sin seña con este profesional queda provisional (desplazable por ' +
      'quien pague la seña). En el flujo "cualquiera", el front puede mostrar el aviso pre-reserva ' +
      'si al menos un profesional lo tiene en true. false = el turno sin seña queda firme.',
  })
  allowProvisionalBookings!: boolean;
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

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Descripción del servicio (qué incluye / qué se realiza).',
  })
  description!: string | null;

  @ApiProperty({
    type: [String],
    description: 'URLs firmadas (temporales) de las imágenes de ejemplo del servicio.',
  })
  imageUrls!: string[];

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

  @ApiProperty({ type: Boolean })
  allowCash!: boolean;

  @ApiProperty({ type: Boolean })
  allowTransfer!: boolean;

  @ApiPropertyOptional({ type: Number, nullable: true })
  depositAmountCents!: number | null;

  @ApiPropertyOptional({
    type: ServicePricing,
    description: 'Precios con/sin IVA (full y seña). El IVA solo aplica a pagos por Mercado Pago.',
  })
  pricing?: ServicePricing;

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
