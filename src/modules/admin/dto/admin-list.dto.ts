import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProfessionalClientStatus } from '@/common/enums';
import { PaginatedDto } from '@/common/dto/paginated.dto';
import { Professional } from '@/modules/professionals/entities/professional.entity';
import { Subscription } from '@/modules/subscriptions/entities/subscription.entity';
import { Comercio } from '@/modules/comercios/entities/comercio.entity';

/**
 * Cliente visto desde el admin (global): datos de la persona + a que profesional
 * pertenece. `deletedAt` no-null = eliminado (soft-delete).
 */
export class AdminClientDto {
  @ApiProperty({ format: 'uuid', description: 'id del vinculo professional_client' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  personId!: string;

  @ApiProperty({ format: 'uuid', description: 'profesional dueño del cliente' })
  professionalId!: string;

  @ApiProperty({ description: 'businessName del profesional dueño' })
  professionalName!: string;

  @ApiProperty({ enum: ProfessionalClientStatus, enumName: 'ProfessionalClientStatus' })
  status!: ProfessionalClientStatus;

  @ApiProperty()
  fullName!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  email!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  phone!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'null = activo; con valor = eliminado (soft-delete)',
  })
  deletedAt!: string | null;
}

export class AdminClientPageDto extends PaginatedDto<AdminClientDto> {
  @ApiProperty({ type: [AdminClientDto] })
  declare items: AdminClientDto[];
}

/** Comercio visto desde el admin, con el email de la cuenta comercial dueña. */
export class AdminComercioDto {
  @ApiProperty({ type: Comercio })
  comercio!: Comercio;

  @ApiPropertyOptional({ type: String, nullable: true, description: 'email de la cuenta dueña' })
  ownerEmail!: string | null;

  @ApiProperty({ type: Number, description: 'membresias activas (no eliminadas)' })
  activeMembers!: number;
}

export class AdminComercioPageDto extends PaginatedDto<AdminComercioDto> {
  @ApiProperty({ type: [AdminComercioDto] })
  declare items: AdminComercioDto[];
}

/** Profesional + su suscripcion, para el listado paginado del admin. */
export class AdminProfessionalDto {
  @ApiProperty({ type: Professional })
  professional!: Professional;

  @ApiPropertyOptional({ type: Subscription, nullable: true })
  subscription!: Subscription | null;
}

export class AdminProfessionalPageDto extends PaginatedDto<AdminProfessionalDto> {
  @ApiProperty({ type: [AdminProfessionalDto] })
  declare items: AdminProfessionalDto[];
}
