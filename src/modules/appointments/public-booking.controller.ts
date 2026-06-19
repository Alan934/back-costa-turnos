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
import { ServiceCombinationRulesService } from '@/modules/catalog/service-combination-rules.service';
import { AvailabilityService } from '@/modules/availability/availability.service';
import { DayAvailabilityDto } from '@/modules/availability/dto/availability.dto';
import { SubscriptionsService } from '@/modules/subscriptions/subscriptions.service';
import { FilesService } from '@/modules/files/files.service';
import { AppointmentsService } from './appointments.service';
import { Appointment } from './entities/appointment.entity';
import {
  ComercioPublicPageDto,
  PublicProfessionalDetailDto,
  PublicProfessionalDto,
  PublicServiceDto,
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
    private readonly combinationRules: ServiceCombinationRulesService,
    private readonly files: FilesService,
  ) {}

  /** Dirección visible: la propia de la membresía o, si no hay, la del comercio. */
  private resolveAddress(membership: Membership, comercio: Comercio): string | null {
    return membership.address ?? comercio.address;
  }

  private toPublicProfessional(membership: Membership, comercio: Comercio): PublicProfessionalDto {
    const settings = membership.professional?.publicPageSettings ?? {};
    return {
      membershipId: membership.id,
      professionalId: membership.professionalId,
      displayName: membership.professional?.businessName ?? 'Profesional',
      address: this.resolveAddress(membership, comercio),
      bio: settings.bio ?? null,
      phone: settings.phone ?? null,
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

  // ---- Catálogo del comercio + flujo Servicio → Profesional/"cualquiera" → Horario ----
  @ApiOperation({
    summary: 'Catálogo de servicios del comercio (con los profesionales que los ofrecen)',
    description:
      'Si un servicio tiene un solo profesional, el front muestra su nombre; si tiene varios, ' +
      'habilita la opción "cualquiera". Solo servicios activos con al menos un profesional activo.',
  })
  @ApiResponse({ status: 200, type: PublicServiceDto, isArray: true })
  @ApiResponse({ status: 404, description: 'No encontrado' })
  @Get('services')
  async services(@Param('slug') slug: string): Promise<PublicServiceDto[]> {
    const comercio = await this.comercios.getComercioBySlug(slug);
    const [list, members] = await Promise.all([
      this.catalog.listPublicByComercio(comercio.id),
      this.comercios.listActiveMembers(comercio.id),
    ]);
    const addressByMembership = new Map(
      members.map((m) => [m.id, this.resolveAddress(m, comercio)]),
    );
    return Promise.all(
      list.map(async (s) => ({
        serviceId: s.id,
        name: s.name,
        description: s.description,
        imageUrls: await this.files.getSignedUrlsForKeys(s.imageKeys ?? []),
        durationMinutes: s.durationMinutes,
        priceCents: s.priceCents,
        allowDeposit: s.allowDeposit,
        allowFullPayment: s.allowFullPayment,
        allowNoPayment: s.allowNoPayment,
        allowCash: s.allowCash,
        depositAmountCents: s.depositAmountCents,
        professionals: (s.assignedMemberships ?? []).map((a) => ({
          membershipId: a.membershipId,
          professionalId: a.professionalId,
          displayName: a.displayName,
          address: addressByMembership.get(a.membershipId) ?? comercio.address,
        })),
      })),
    );
  }

  @ApiOperation({
    summary: 'Slots de un servicio del comercio ("cualquiera"): unión deduplicada de profesionales',
  })
  @ApiResponse({
    status: 200,
    description: 'Array de slots (startAt/endAt UTC ISO), sin profesional.',
  })
  @ApiResponse({ status: 404, description: 'No encontrado' })
  @Get('services/:serviceId/slots')
  async serviceSlots(
    @Param('slug') slug: string,
    @Param('serviceId') serviceId: string,
    @Query('addonServiceIds') addonServiceIds: string | undefined,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    const comercio = await this.comercios.getComercioBySlug(slug);
    const addonIds = addonServiceIds ? addonServiceIds.split(',').filter(Boolean) : [];
    return this.availability.computeServiceSlots(comercio.id, serviceId, from, to, addonIds);
  }

  @ApiOperation({
    summary: 'Disponibilidad por día de un servicio del comercio (agregada entre profesionales)',
  })
  @ApiResponse({ status: 200, type: DayAvailabilityDto, isArray: true })
  @ApiResponse({ status: 404, description: 'No encontrado' })
  @Get('services/:serviceId/day-availability')
  async serviceDayAvailability(
    @Param('slug') slug: string,
    @Param('serviceId') serviceId: string,
    @Query('addonServiceIds') addonServiceIds: string | undefined,
    @Query('from') from: string,
    @Query('to') to: string,
  ): Promise<DayAvailabilityDto[]> {
    const comercio = await this.comercios.getComercioBySlug(slug);
    const addonIds = addonServiceIds ? addonServiceIds.split(',').filter(Boolean) : [];
    return this.availability.computeServiceDayAvailability(
      comercio.id,
      serviceId,
      from,
      to,
      addonIds,
    );
  }

  @ApiOperation({
    summary:
      'Reservar un servicio ("cualquiera"): el back elige el profesional (menor carga ese día)',
  })
  @ApiResponse({
    status: 201,
    type: Appointment,
    description: 'Trae membershipId/professionalId asignado.',
  })
  @ApiResponse({ status: 404, description: 'No encontrado' })
  @ApiResponse({ status: 409, description: 'Ningún profesional disponible' })
  @Post('services/:serviceId/book')
  async bookService(
    @Param('slug') slug: string,
    @Param('serviceId') serviceId: string,
    @Body() dto: PublicBookDto,
  ) {
    const comercio = await this.comercios.getComercioBySlug(slug);
    return this.appointments.bookForService(comercio.id, serviceId, dto, CreatedVia.ClientSelf);
  }

  @ApiOperation({
    summary: 'Reservar un servicio con seña/pago ("cualquiera"): el back elige el profesional',
  })
  @ApiResponse({
    status: 201,
    description:
      'Objeto { appointment, payment, mpInitPoint? } (ver ruta con membershipId). El profesional ' +
      'asignado queda en appointment.membershipId/professionalId.',
  })
  @ApiResponse({ status: 404, description: 'No encontrado' })
  @ApiResponse({ status: 409, description: 'Ningún profesional disponible' })
  @Post('services/:serviceId/book-with-deposit')
  async bookServiceWithDeposit(
    @Param('slug') slug: string,
    @Param('serviceId') serviceId: string,
    @Body() dto: PublicBookWithDepositDto,
  ) {
    const comercio = await this.comercios.getComercioBySlug(slug);
    return this.appointments.bookWithDepositForService(comercio.id, serviceId, dto);
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
    const membership = await this.comercios.getActiveMembershipInComercio(
      comercio.id,
      membershipId,
    );
    const services = await this.catalog.listActiveByMembership(membership.id);
    return {
      ...this.toPublicProfessional(membership, comercio),
      timezone: comercio.timezone,
      services,
    };
  }

  // ---- Reglas de combinación de un servicio (para el flujo de reserva público) ----
  @ApiOperation({
    summary:
      'Reglas de combinación para un servicio (add-ons habilitados, exclusiones, descuentos)',
    description:
      'Devuelve las reglas donde sourceServiceId = serviceId. El frontend las usa para ' +
      'mostrar qué add-ons puede agregar el cliente, qué descuentos aplican y qué servicios ' +
      'no pueden combinarse.',
  })
  @ApiResponse({
    status: 200,
    description: 'Array de ServiceCombinationRule con targetService cargado',
  })
  @ApiResponse({ status: 404, description: 'No encontrado' })
  @Get('professionals/:membershipId/services/:serviceId/combination-rules')
  async combinationRulesForService(
    @Param('slug') slug: string,
    @Param('membershipId') membershipId: string,
    @Param('serviceId') serviceId: string,
  ) {
    const comercio = await this.comercios.getComercioBySlug(slug);
    const membership = await this.comercios.getActiveMembershipInComercio(
      comercio.id,
      membershipId,
    );
    return this.combinationRules.listBySourceService(membership.id, serviceId);
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
    @Query('addonServiceIds') addonServiceIds: string | undefined,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    const comercio = await this.comercios.getComercioBySlug(slug);
    await this.comercios.getActiveMembershipInComercio(comercio.id, membershipId);
    const addonIds = addonServiceIds ? addonServiceIds.split(',').filter(Boolean) : [];
    return this.availability.computeSlotsByMembership(membershipId, serviceId, from, to, addonIds);
  }

  // ---- Disponibilidad por día (motivo del bloqueo para el chip del front) ----
  @ApiOperation({
    summary: 'Disponibilidad por día de un profesional (motivo cuando no es reservable)',
    description:
      'Por cada fecha del rango devuelve status (available/closed/time_off/full) y, cuando ' +
      'status=time_off, el motivo cargado por el profesional. Útil para el chip deshabilitado.',
  })
  @ApiResponse({ status: 200, type: DayAvailabilityDto, isArray: true })
  @ApiResponse({ status: 404, description: 'No encontrado' })
  @Get('professionals/:membershipId/day-availability')
  async dayAvailability(
    @Param('slug') slug: string,
    @Param('membershipId') membershipId: string,
    @Query('serviceId') serviceId: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ): Promise<DayAvailabilityDto[]> {
    const comercio = await this.comercios.getComercioBySlug(slug);
    await this.comercios.getActiveMembershipInComercio(comercio.id, membershipId);
    return this.availability.computeDayAvailabilityByMembership(membershipId, serviceId, from, to);
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
  @ApiResponse({
    status: 201,
    description:
      'Objeto { appointment, payment, mpInitPoint? }. Con method=mercadopago, appointment es ' +
      'null (el turno se crea al acreditarse el pago vía webhook) y mpInitPoint es la URL de ' +
      'checkout a la que el front debe redirigir. El horario queda reservado (hold) ~15 min.',
  })
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
    @Query('addonServiceIds') addonServiceIds: string | undefined,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    const comercio = await this.comercios.getComercioBySlug(slug);
    const membership = await this.singleMembershipOrThrow(comercio.id);
    const addonIds = addonServiceIds ? addonServiceIds.split(',').filter(Boolean) : [];
    return this.availability.computeSlotsByMembership(membership.id, serviceId, from, to, addonIds);
  }

  @ApiOperation({
    summary: 'Disponibilidad por día (comercio-de-uno): auto-resuelve el único profesional',
    deprecated: true,
  })
  @ApiResponse({ status: 200, type: DayAvailabilityDto, isArray: true })
  @Get('day-availability')
  async dayAvailabilityFlat(
    @Param('slug') slug: string,
    @Query('serviceId') serviceId: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ): Promise<DayAvailabilityDto[]> {
    const comercio = await this.comercios.getComercioBySlug(slug);
    const membership = await this.singleMembershipOrThrow(comercio.id);
    return this.availability.computeDayAvailabilityByMembership(membership.id, serviceId, from, to);
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
  @ApiResponse({
    status: 201,
    description: 'Objeto { appointment, payment, mpInitPoint? } (ver ruta con membershipId).',
  })
  @Post('book-with-deposit')
  async bookWithDepositFlat(@Param('slug') slug: string, @Body() dto: PublicBookWithDepositDto) {
    const comercio = await this.comercios.getComercioBySlug(slug);
    const membership = await this.singleMembershipOrThrow(comercio.id);
    await this.assertBookable(membership.professionalId);
    return this.appointments.bookWithDepositForMembership(membership.id, dto);
  }
}
