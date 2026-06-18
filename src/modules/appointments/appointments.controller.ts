import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { TenantGuard } from '@/common/guards/tenant.guard';
import { SubscriptionGuard } from '@/common/guards/subscription.guard';
import { Roles } from '@/common/decorators/roles.decorator';
import { CurrentTenant } from '@/common/decorators/current-tenant.decorator';
import { AppRole, CreatedVia } from '@/common/enums';
import { AppointmentsService } from './appointments.service';
import { Appointment } from './entities/appointment.entity';
import {
  BookAppointmentDto,
  BookWithDepositDto,
  CancelAppointmentDto,
  CompleteAppointmentDto,
} from './dto/appointment.dto';

@ApiTags('appointments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard, SubscriptionGuard)
@Roles(AppRole.Professional, AppRole.Staff)
@Controller('appointments')
export class AppointmentsController {
  constructor(private readonly appointments: AppointmentsService) {}

  @ApiOperation({ summary: 'Listar turnos del tenant' })
  @ApiQuery({ name: 'staffId', required: false })
  @ApiResponse({ status: 200, type: Appointment, isArray: true })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  @Get()
  list(@CurrentTenant() tenantId: string, @Query('staffId') staffId?: string) {
    return this.appointments.list(tenantId, staffId);
  }

  @ApiOperation({ summary: 'Reservar un turno' })
  @ApiResponse({ status: 201, type: Appointment })
  @ApiResponse({ status: 400, description: 'Datos invalidos' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  @ApiResponse({ status: 409, description: 'Conflicto' })
  @Post()
  book(@CurrentTenant() tenantId: string, @Body() dto: BookAppointmentDto) {
    return this.appointments.book(tenantId, dto, CreatedVia.Professional);
  }

  @ApiOperation({ summary: 'Reservar un turno pagando la sena' })
  @ApiResponse({
    status: 201,
    description:
      'Objeto { appointment, payment, mpInitPoint? }. Con method=mercadopago el turno NO se ' +
      'crea todavía (appointment es null): se crea al acreditarse el pago vía webhook; usar ' +
      'mpInitPoint para redirigir al checkout. Con method=cash el turno se crea en el acto.',
  })
  @ApiResponse({ status: 400, description: 'Datos invalidos' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  @ApiResponse({ status: 409, description: 'Conflicto' })
  @Post('with-deposit')
  bookWithDeposit(@CurrentTenant() tenantId: string, @Body() dto: BookWithDepositDto) {
    return this.appointments.bookWithDeposit(tenantId, dto);
  }

  @ApiOperation({ summary: 'Obtener la sala de espera de un staff' })
  @ApiResponse({
    status: 200,
    description:
      'Estructura computada { staffId, generatedAt, queue[] } con los ETA estimados de la cola.',
  })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  @ApiResponse({ status: 404, description: 'No encontrado' })
  @Get('waiting-room/:staffId')
  waitingRoom(@CurrentTenant() tenantId: string, @Param('staffId') staffId: string) {
    return this.appointments.computeWaitingRoom(tenantId, staffId);
  }

  @ApiOperation({ summary: 'Obtener un turno por id' })
  @ApiResponse({ status: 200, type: Appointment })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  @ApiResponse({ status: 404, description: 'No encontrado' })
  @Get(':id')
  get(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.appointments.findById(tenantId, id);
  }

  @ApiOperation({ summary: 'Confirmar un turno' })
  @ApiResponse({ status: 201, type: Appointment })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  @ApiResponse({ status: 404, description: 'No encontrado' })
  @Post(':id/confirm')
  confirm(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.appointments.confirm(tenantId, id);
  }

  @ApiOperation({ summary: 'Iniciar un turno' })
  @ApiResponse({ status: 201, type: Appointment })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  @ApiResponse({ status: 404, description: 'No encontrado' })
  @Post(':id/start')
  start(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.appointments.start(tenantId, id);
  }

  @ApiOperation({
    summary: 'Completar un turno',
    description:
      'Con pago en efectivo pendiente, enviar cashOutcome=collected (cobró) o deferred ' +
      '(pagaré, el cliente quedó debiendo). Si se omite, el pago queda pendiente en el cierre de caja.',
  })
  @ApiResponse({ status: 201, type: Appointment })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  @ApiResponse({ status: 404, description: 'No encontrado' })
  @Post(':id/complete')
  complete(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: CompleteAppointmentDto,
  ) {
    return this.appointments.complete(tenantId, id, dto.cashOutcome, dto.note);
  }

  @ApiOperation({ summary: 'Marcar un turno como no-show' })
  @ApiResponse({ status: 201, type: Appointment })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  @ApiResponse({ status: 404, description: 'No encontrado' })
  @Post(':id/no-show')
  noShow(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.appointments.noShow(tenantId, id);
  }

  @ApiOperation({ summary: 'Cancelar un turno' })
  @ApiResponse({ status: 201, type: Appointment })
  @ApiResponse({ status: 400, description: 'Datos invalidos' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  @ApiResponse({ status: 404, description: 'No encontrado' })
  @Post(':id/cancel')
  cancel(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: CancelAppointmentDto,
  ) {
    return this.appointments.cancel(tenantId, id, dto.reason);
  }
}
