import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Service } from '@/modules/catalog/entities/service.entity';

export class PublicStaffDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Lucía' })
  displayName!: string;
}

/** Respuesta de GET /r/:slug: lo que necesita la página pública para reservar. */
export class PublicPageDto {
  @ApiProperty()
  businessName!: string;

  @ApiProperty()
  slug!: string;

  @ApiProperty()
  timezone!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  address!: string | null;

  @ApiProperty({ type: 'object', additionalProperties: true })
  settings!: Record<string, unknown>;

  @ApiProperty({ type: Service, isArray: true })
  services!: Service[];

  @ApiProperty({
    type: PublicStaffDto,
    isArray: true,
    description: 'Staff activo (necesario para elegir profesional y calcular horarios).',
  })
  staff!: PublicStaffDto[];
}
