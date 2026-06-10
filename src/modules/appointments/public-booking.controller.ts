import {
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
import { ProfessionalsService } from '@/modules/professionals/professionals.service';
import { CatalogService } from '@/modules/catalog/catalog.service';
import { AvailabilityService } from '@/modules/availability/availability.service';
import { SubscriptionsService } from '@/modules/subscriptions/subscriptions.service';
import { AppointmentsService } from './appointments.service';
import { Appointment } from './entities/appointment.entity';
import { BookAppointmentDto, BookWithDepositDto } from './dto/appointment.dto';

/**
 * Pagina publica de reservas: /r/:slug. No requiere auth; el tenant se resuelve
 * por el slug del professional.
 */
@ApiTags('public-booking')
@Public()
@Controller({ path: 'r/:slug', version: VERSION_NEUTRAL })
export class PublicBookingController {
  constructor(
    private readonly professionals: ProfessionalsService,
    private readonly catalog: CatalogService,
    private readonly availability: AvailabilityService,
    private readonly subscriptions: SubscriptionsService,
    private readonly appointments: AppointmentsService,
  ) {}

  private async tenantId(slug: string): Promise<string> {
    const professional = await this.professionals.findBySlug(slug);
    return professional.id;
  }

  /** Bloquea la reserva publica si la suscripcion del profesional esta vencida. */
  private async assertBookable(tenantId: string): Promise<void> {
    const sub = await this.subscriptions.getByTenant(tenantId).catch(() => null);
    if (sub && !this.subscriptions.hasWriteAccess(sub)) {
      throw new ForbiddenException('Esta agenda no esta disponible en este momento.');
    }
  }

  @ApiOperation({ summary: 'Obtener la pagina publica de reservas' })
  @ApiResponse({
    status: 200,
    description:
      'Objeto computado { businessName, slug, timezone, settings, services[] } de la pagina publica.',
  })
  @ApiResponse({ status: 404, description: 'No encontrado' })
  @Get()
  async page(@Param('slug') slug: string) {
    const professional = await this.professionals.findBySlug(slug);
    const services = await this.catalog.listActive(professional.id);
    return {
      businessName: professional.businessName,
      slug: professional.slug,
      timezone: professional.timezone,
      settings: professional.publicPageSettings,
      services,
    };
  }

  @ApiOperation({ summary: 'Calcular slots disponibles' })
  @ApiResponse({
    status: 200,
    description: 'Array de slots disponibles (objetos planos con horarios calculados).',
  })
  @ApiResponse({ status: 404, description: 'No encontrado' })
  @Get('slots')
  async slots(
    @Param('slug') slug: string,
    @Query('staffId') staffId: string,
    @Query('serviceId') serviceId: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    const tenantId = await this.tenantId(slug);
    return this.availability.computeSlots(tenantId, staffId, serviceId, from, to);
  }

  @ApiOperation({ summary: 'Reservar un turno desde la pagina publica' })
  @ApiResponse({ status: 201, type: Appointment })
  @ApiResponse({ status: 400, description: 'Datos invalidos' })
  @ApiResponse({ status: 404, description: 'No encontrado' })
  @ApiResponse({ status: 409, description: 'Conflicto' })
  @Post('book')
  async book(@Param('slug') slug: string, @Body() dto: BookAppointmentDto) {
    const tenantId = await this.tenantId(slug);
    await this.assertBookable(tenantId);
    return this.appointments.book(tenantId, dto, CreatedVia.ClientSelf);
  }

  @ApiOperation({ summary: 'Reservar un turno con sena desde la pagina publica' })
  @ApiResponse({
    status: 201,
    description: 'Devuelve un objeto { appointment, payment } con el turno y el pago de la sena.',
  })
  @ApiResponse({ status: 400, description: 'Datos invalidos' })
  @ApiResponse({ status: 404, description: 'No encontrado' })
  @ApiResponse({ status: 409, description: 'Conflicto' })
  @Post('book-with-deposit')
  async bookWithDeposit(@Param('slug') slug: string, @Body() dto: BookWithDepositDto) {
    const tenantId = await this.tenantId(slug);
    await this.assertBookable(tenantId);
    return this.appointments.bookWithDeposit(tenantId, dto);
  }
}
