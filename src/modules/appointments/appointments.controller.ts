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
  BookWithDepositResultDto,
  CancelAppointmentDto,
  CompleteAppointmentDto,
} from './dto/appointment.dto';
import {
  AssignServiceDto,
  CreateWalkInDto,
  MoveInQueueDto,
  SendToBackDto,
  SetPriorityDto,
  WaitingRoomDto,
  WaitingRoomStatsDto,
} from './dto/waiting-room.dto';

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
    type: BookWithDepositResultDto,
    description:
      'Con method=mercadopago el turno NO se crea todavía (appointment es null): se crea al ' +
      'acreditarse el pago vía webhook; usar mpInitPoint para redirigir al checkout. Con ' +
      'method=cash o transfer el turno se crea en el acto y el pago queda pending.',
  })
  @ApiResponse({ status: 400, description: 'Datos invalidos' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  @ApiResponse({ status: 409, description: 'Conflicto' })
  @Post('with-deposit')
  bookWithDeposit(@CurrentTenant() tenantId: string, @Body() dto: BookWithDepositDto) {
    return this.appointments.bookWithDeposit(tenantId, dto);
  }

  @ApiOperation({
    summary: 'Obtener la sala de espera de un staff',
    description:
      'La cola son solo los presentes (con check-in de llegada), en orden de atención, con ' +
      'posición y ETA. `pending` son los self check-in esperando aprobación del profesional.',
  })
  @ApiQuery({
    name: 'membershipId',
    required: false,
    description: 'Comercio donde está atendiendo. Por defecto, su comercio propio.',
  })
  @ApiResponse({ status: 200, type: WaitingRoomDto })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  @ApiResponse({ status: 404, description: 'No encontrado' })
  @Get('waiting-room/:staffId')
  waitingRoom(
    @CurrentTenant() tenantId: string,
    @Param('staffId') staffId: string,
    @Query('membershipId') membershipId?: string,
  ) {
    return this.appointments.computeWaitingRoom(tenantId, staffId, membershipId);
  }

  @ApiOperation({
    summary: 'Estadísticas de la sala de los últimos N días',
    description:
      'Espera promedio/máxima, duración real de las atenciones, horas pico de llegada y ' +
      'servicios más pedidos. Las horas van en la zona horaria del profesional.',
  })
  @ApiQuery({ name: 'days', required: false, description: 'Ventana en días (1-365). Default 30.' })
  @ApiResponse({ status: 200, type: WaitingRoomStatsDto })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  @Get('waiting-room/:staffId/stats')
  waitingRoomStats(
    @CurrentTenant() tenantId: string,
    @Param('staffId') staffId: string,
    @Query('days') days?: string,
  ) {
    return this.appointments.getWaitingRoomStats(tenantId, staffId, days ? Number(days) || 30 : 30);
  }

  @ApiOperation({
    summary: 'Agregar a la cola un cliente que llegó sin turno',
    description:
      'Crea el turno en el momento (createdVia=walk_in, startAt=ahora) ya presente en la sala. ' +
      'Aceptá un personId de la cartera o fullName (+ teléfono) para dar de alta a alguien nuevo.',
  })
  @ApiResponse({ status: 201, type: Appointment })
  @ApiResponse({ status: 400, description: 'Datos invalidos' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  @ApiResponse({ status: 404, description: 'No encontrado' })
  @Post('walk-in')
  walkIn(@CurrentTenant() tenantId: string, @Body() dto: CreateWalkInDto) {
    return this.appointments.createWalkInForTenant(tenantId, dto);
  }

  @ApiOperation({
    summary: 'Marcar que el cliente llegó (entra a la sala de espera)',
    description: 'Le asigna número de turno del día. Idempotente: no cambia el número si ya llegó.',
  })
  @ApiResponse({ status: 201, type: Appointment })
  @ApiResponse({ status: 400, description: 'El turno ya está cerrado' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  @ApiResponse({ status: 404, description: 'No encontrado' })
  @Post(':id/check-in')
  checkIn(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.appointments.checkIn(tenantId, id);
  }

  @ApiOperation({
    summary: 'Llamar a alguien de la fila ("pasá, te toca")',
    description:
      'Le llega un push con vibración y su pantalla pasa a "¡Es tu turno!". Se puede repetir ' +
      'si no responde.',
  })
  @ApiResponse({ status: 201, type: Appointment })
  @ApiResponse({ status: 400, description: 'No está en la fila' })
  @ApiResponse({ status: 404, description: 'No encontrado' })
  @Post(':id/call')
  call(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.appointments.call(tenantId, id);
  }

  @ApiOperation({
    summary: 'Mandar atrás en la fila (no respondió)',
    description:
      'Alternativa a marcarlo como que no vino. `position`: `end` (default) lo manda al último ' +
      'lugar; `next` lo pasa un solo lugar atrás (cede el paso a quien venía detrás). El número ' +
      'de turno acompaña al lugar: se reasignan 1..n según el nuevo orden.',
  })
  @ApiResponse({ status: 201, type: Appointment })
  @ApiResponse({ status: 400, description: 'No está en la fila' })
  @ApiResponse({ status: 404, description: 'No encontrado' })
  @Post(':id/send-to-back')
  sendToBack(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: SendToBackDto,
  ) {
    return this.appointments.sendToBack(tenantId, id, dto?.position ?? 'end');
  }

  @ApiOperation({
    summary: 'Asignar el servicio a una entrada de la sala',
    description:
      'Para quien se anotó sin elegir servicio (o para corregirlo): el profesional lo completa al ' +
      'atenderlo o cobrarlo. Solo entradas de sala (walk-in); el servicio debe ser uno activo suyo.',
  })
  @ApiResponse({ status: 201, type: Appointment })
  @ApiResponse({ status: 400, description: 'No es una entrada de sala / turno cerrado' })
  @ApiResponse({ status: 404, description: 'Turno o servicio no encontrado' })
  @Post(':id/service')
  assignService(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: AssignServiceDto,
  ) {
    return this.appointments.assignService(tenantId, id, dto.serviceId);
  }

  @ApiOperation({ summary: 'Subir o bajar un lugar en la fila' })
  @ApiResponse({ status: 201, type: Appointment })
  @ApiResponse({ status: 400, description: 'No está en la fila / cruza grupo de prioridad' })
  @ApiResponse({ status: 404, description: 'No encontrado' })
  @Post(':id/move')
  move(@CurrentTenant() tenantId: string, @Param('id') id: string, @Body() dto: MoveInQueueDto) {
    return this.appointments.moveInQueue(tenantId, id, dto.direction);
  }

  @ApiOperation({ summary: 'Marcar/desmarcar como urgente (pasa al frente de la fila)' })
  @ApiResponse({ status: 201, type: Appointment })
  @ApiResponse({ status: 400, description: 'No está en la fila' })
  @ApiResponse({ status: 404, description: 'No encontrado' })
  @Post(':id/priority')
  priority(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: SetPriorityDto,
  ) {
    return this.appointments.setPriority(tenantId, id, dto.priority);
  }

  @ApiOperation({
    summary: 'Deshacer el check-in (sale de la cola, el turno se conserva)',
  })
  @ApiResponse({ status: 201, type: Appointment })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  @ApiResponse({ status: 404, description: 'No encontrado' })
  @Post(':id/undo-check-in')
  undoCheckIn(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.appointments.undoCheckIn(tenantId, id);
  }

  @ApiOperation({ summary: 'Obtener un turno por id' })
  @ApiResponse({ status: 200, type: Appointment })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  @ApiResponse({ status: 404, description: 'No encontrado' })
  @Get(':id')
  get(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.appointments.findByIdWithContact(tenantId, id);
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
