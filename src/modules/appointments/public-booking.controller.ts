import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Query,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '@/common/decorators/public.decorator';
import { CreatedVia } from '@/common/enums';
import { ComerciosService } from '@/modules/comercios/comercios.service';
import { Comercio } from '@/modules/comercios/entities/comercio.entity';
import { Membership } from '@/modules/comercios/entities/membership.entity';
import { CatalogService } from '@/modules/catalog/catalog.service';
import { AvailabilityService } from '@/modules/availability/availability.service';
import { SubscriptionsService } from '@/modules/subscriptions/subscriptions.service';
import { AppointmentsService } from './appointments.service';
import { Appointment } from './entities/appointment.entity';
import {
  ComercioPublicPageDto,
  PublicProfessionalDetailDto,
  PublicProfessionalDto,
} from './dto/comercio-public-page.dto';
import { PublicBookDto, PublicBookWithDepositDto } from './dto/appointment.dto';

/**
 * Página pública de reservas por COMERCIO: /r/:slug. No requiere auth; el slug
 * resuelve un comercio (incluido el comercio-de-uno de un profesional solo). El
 * cliente elige profesional (membresía) → servicio → slot.
 */
@ApiTags('public-booking')
@Public()
@Controller({ path: 'r/:slug', version: VERSION_NEUTRAL })
export class PublicBookingController {
  constructor(
    private readonly comercios: ComerciosService,
    private readonly catalog: CatalogService,
    private readonly availability: AvailabilityService,
    private readonly subscriptions: SubscriptionsService,
    private readonly appointments: AppointmentsService,
  ) {}

  /** Dirección visible: la propia de la membresía o, si no hay, la del comercio. */
  private resolveAddress(membership: Membership, comercio: Comercio): string | null {
    return membership.address ?? comercio.address;
  }

  private toPublicProfessional(membership: Membership, comercio: Comercio): PublicProfessionalDto {
    return {
      membershipId: membership.id,
      professionalId: membership.professionalId,
      displayName: membership.professional?.businessName ?? 'Profesional',
      address: this.resolveAddress(membership, comercio),
    };
  }

  /**
   * Bloquea la reserva si la suscripción del profesional está vencida. (La paga el
   * worker, así que se evalúa por professionalId.)
   */
  private async assertBookable(professionalId: string): Promise<void> {
    const sub = await this.subscriptions.getByTenant(professionalId).catch(() => null);
    if (sub && !this.subscriptions.hasWriteAccess(sub)) {
      throw new ForbiddenException('Esta agenda no está disponible en este momento.');
    }
  }

  /** Comercio-de-uno: si el comercio tiene una sola membresía activa, la devuelve. */
  private async singleMembershipOrThrow(comercioId: string): Promise<Membership> {
    const members = await this.comercios.listActiveMembers(comercioId);
    if (members.length === 0) throw new ForbiddenException('El comercio no tiene profesionales.');
    if (members.length > 1) {
      throw new BadRequestException(
        'El comercio tiene varios profesionales: elegí uno (usá /r/:slug/professionals/:membershipId).',
      );
    }
    return members[0];
  }

  // ---- Página del comercio ----
  @ApiOperation({ summary: 'Página pública del comercio (lista de profesionales)' })
  @ApiResponse({ status: 200, type: ComercioPublicPageDto })
  @ApiResponse({ status: 404, description: 'No encontrado' })
  @Get()
  async page(@Param('slug') slug: string): Promise<ComercioPublicPageDto> {
    const comercio = await this.comercios.getComercioBySlug(slug);
    const members = await this.comercios.listActiveMembers(comercio.id);
    return {
      comercioId: comercio.id,
      name: comercio.name,
      slug: comercio.slug,
      timezone: comercio.timezone,
      address: comercio.address,
      isPersonal: comercio.isPersonal,
      settings: comercio.publicPageSettings,
      professionals: members.map((m) => this.toPublicProfessional(m, comercio)),
    };
  }

  // ---- Detalle de un profesional del comercio (servicios + ubicación) ----
  @ApiOperation({ summary: 'Servicios y ubicación de un profesional en el comercio' })
  @ApiResponse({ status: 200, type: PublicProfessionalDetailDto })
  @ApiResponse({ status: 404, description: 'No encontrado' })
  @Get('professionals/:membershipId')
  async professional(
    @Param('slug') slug: string,
    @Param('membershipId') membershipId: string,
  ): Promise<PublicProfessionalDetailDto> {
    const comercio = await this.comercios.getComercioBySlug(slug);
    const membership = await this.comercios.getActiveMembershipInComercio(comercio.id, membershipId);
    const services = await this.catalog.listActiveByMembership(membership.id);
    return {
      ...this.toPublicProfessional(membership, comercio),
      timezone: comercio.timezone,
      services,
    };
  }

  // ---- Slots de un profesional del comercio ----
  @ApiOperation({ summary: 'Slots disponibles de un profesional en el comercio' })
  @ApiResponse({ status: 200, description: 'Array de slots (startAt/endAt UTC ISO).' })
  @ApiResponse({ status: 404, description: 'No encontrado' })
  @Get('professionals/:membershipId/slots')
  async slots(
    @Param('slug') slug: string,
    @Param('membershipId') membershipId: string,
    @Query('serviceId') serviceId: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    const comercio = await this.comercios.getComercioBySlug(slug);
    await this.comercios.getActiveMembershipInComercio(comercio.id, membershipId);
    return this.availability.computeSlotsByMembership(membershipId, serviceId, from, to);
  }

  // ---- Reservas (eligiendo profesional por membershipId) ----
  @ApiOperation({ summary: 'Reservar un turno con un profesional del comercio' })
  @ApiResponse({ status: 201, type: Appointment })
  @ApiResponse({ status: 404, description: 'No encontrado' })
  @ApiResponse({ status: 409, description: 'Conflicto' })
  @Post('professionals/:membershipId/book')
  async book(
    @Param('slug') slug: string,
    @Param('membershipId') membershipId: string,
    @Body() dto: PublicBookDto,
  ) {
    const membership = await this.resolveMembership(slug, membershipId);
    await this.assertBookable(membership.professionalId);
    return this.appointments.bookForMembership(membershipId, dto, CreatedVia.ClientSelf);
  }

  @ApiOperation({ summary: 'Reservar con seña/pago completo con un profesional del comercio' })
  @ApiResponse({ status: 201, description: 'Objeto { appointment, payment }.' })
  @ApiResponse({ status: 404, description: 'No encontrado' })
  @ApiResponse({ status: 409, description: 'Conflicto' })
  @Post('professionals/:membershipId/book-with-deposit')
  async bookWithDeposit(
    @Param('slug') slug: string,
    @Param('membershipId') membershipId: string,
    @Body() dto: PublicBookWithDepositDto,
  ) {
    const membership = await this.resolveMembership(slug, membershipId);
    await this.assertBookable(membership.professionalId);
    return this.appointments.bookWithDepositForMembership(membershipId, dto);
  }

  private async resolveMembership(slug: string, membershipId: string): Promise<Membership> {
    const comercio = await this.comercios.getComercioBySlug(slug);
    return this.comercios.getActiveMembershipInComercio(comercio.id, membershipId);
  }

  // ---- Compat comercio-de-uno: rutas planas (sin membershipId) ----
  // Auto-resuelven el único profesional del comercio. Si hay varios, 400.

  @ApiOperation({
    summary: 'Slots (comercio-de-uno): auto-resuelve el único profesional',
    deprecated: true,
  })
  @ApiResponse({ status: 200, description: 'Array de slots.' })
  @Get('slots')
  async slotsFlat(
    @Param('slug') slug: string,
    @Query('serviceId') serviceId: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    const comercio = await this.comercios.getComercioBySlug(slug);
    const membership = await this.singleMembershipOrThrow(comercio.id);
    return this.availability.computeSlotsByMembership(membership.id, serviceId, from, to);
  }

  @ApiOperation({
    summary: 'Reservar (comercio-de-uno): auto-resuelve el único profesional',
    deprecated: true,
  })
  @ApiResponse({ status: 201, type: Appointment })
  @Post('book')
  async bookFlat(@Param('slug') slug: string, @Body() dto: PublicBookDto) {
    const comercio = await this.comercios.getComercioBySlug(slug);
    const membership = await this.singleMembershipOrThrow(comercio.id);
    await this.assertBookable(membership.professionalId);
    return this.appointments.bookForMembership(membership.id, dto, CreatedVia.ClientSelf);
  }

  @ApiOperation({
    summary: 'Reservar con seña (comercio-de-uno): auto-resuelve el único profesional',
    deprecated: true,
  })
  @ApiResponse({ status: 201, description: 'Objeto { appointment, payment }.' })
  @Post('book-with-deposit')
  async bookWithDepositFlat(@Param('slug') slug: string, @Body() dto: PublicBookWithDepositDto) {
    const comercio = await this.comercios.getComercioBySlug(slug);
    const membership = await this.singleMembershipOrThrow(comercio.id);
    await this.assertBookable(membership.professionalId);
    return this.appointments.bookWithDepositForMembership(membership.id, dto);
  }
}
