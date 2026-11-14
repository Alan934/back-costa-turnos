import { Body, Controller, HttpCode, HttpStatus, Param, Post, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiPropertyOptional, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
} from 'class-validator';
import { Public } from '@/common/decorators/public.decorator';
import { TitleCase } from '@/common/decorators/title-case.decorator';
import { ComerciosService } from '@/modules/comercios/comercios.service';
import { PersonsService } from '@/modules/identity/persons.service';
import { WaitlistService } from './waitlist.service';

export class PublicJoinWaitlistDto {
  @ApiProperty({ example: 'Sofía Pérez' })
  @IsString()
  @IsNotEmpty()
  @TitleCase()
  fullName!: string;

  @ApiProperty({ example: 'sofia@mail.com', description: 'A este email llega el aviso' })
  @IsEmail()
  email!: string;

  @ApiPropertyOptional({ example: '261 555 1234' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  serviceId!: string;

  @ApiProperty({
    type: String,
    isArray: true,
    description: 'Membresías con las que aceptaría el turno (una, o varias si eligió "cualquiera")',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(30)
  @IsUUID(undefined, { each: true })
  membershipIds!: string[];

  @ApiProperty({ example: '2026-11-20', description: 'Día deseado (zona horaria del comercio)' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date!: string;
}

/**
 * Lista de espera desde la página pública: cuando un día no tiene horarios, el cliente deja
 * su email y le avisamos si se libera un turno ese día. Sin cuenta ni login.
 */
@ApiTags('public-booking')
@Public()
@Controller({ path: 'r/:slug/waitlist', version: VERSION_NEUTRAL })
export class PublicWaitlistController {
  constructor(
    private readonly waitlist: WaitlistService,
    private readonly comercios: ComerciosService,
    private readonly persons: PersonsService,
  ) {}

  @ApiOperation({ summary: 'Anotarse en la lista de espera de un día' })
  @ApiResponse({ status: 201, description: 'Respuesta { ok: true }' })
  @ApiResponse({ status: 400, description: 'Datos inválidos o día pasado' })
  @ApiResponse({ status: 404, description: 'Comercio o profesional no encontrado' })
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.CREATED)
  @Post()
  async join(
    @Param('slug') slug: string,
    @Body() dto: PublicJoinWaitlistDto,
  ): Promise<{ ok: true }> {
    const comercio = await this.comercios.getComercioBySlug(slug);
    // Solo membresías activas DE ESTE comercio: no se puede anotar a nadie en agendas ajenas.
    const memberships = await this.comercios.getActiveMembershipsInComercio(
      comercio.id,
      dto.membershipIds,
    );
    // Se identifica SOLO por email (no por teléfono): el aviso sale al email de la persona, y
    // emparejar por teléfono podía caer en una ficha sin email y el aviso no llegaba a nadie.
    const person = await this.persons.findOrCreate({ fullName: dto.fullName, email: dto.email });
    await this.waitlist.joinPublic({
      personId: person.id,
      professionalIds: memberships.map((m) => m.professionalId),
      serviceId: dto.serviceId,
      date: dto.date,
      timezone: comercio.timezone,
    });
    return { ok: true };
  }
}
