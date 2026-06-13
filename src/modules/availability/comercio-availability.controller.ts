import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { SubscriptionGuard } from '@/common/guards/subscription.guard';
import { ComercioMembershipGuard } from '@/common/guards/comercio-membership.guard';
import { CurrentMembership } from '@/common/decorators/current-comercio.decorator';
import { AvailabilityService } from './availability.service';
import { ScheduleRule } from './entities/schedule-rule.entity';
import { TimeOff } from './entities/time-off.entity';
import {
  ComercioSlotsQueryDto,
  CreateScheduleRuleDto,
  CreateTimeOffDto,
  UpdateScheduleRuleDto,
} from './dto/availability.dto';

/**
 * Horarios/bloqueos/slots del profesional EN UN COMERCIO. El ComercioMembershipGuard
 * valida membresía activa en `:comercioId` y resuelve `membershipId`.
 *
 * `@ApiParam(comercioId)` declara el path param (lo consume el guard). Los
 * operationId salen de la fábrica global (controller+método), únicos respecto al
 * availability legacy.
 */
@ApiTags('availability')
@ApiBearerAuth()
@ApiParam({ name: 'comercioId', format: 'uuid', description: 'Comercio donde opera el profesional' })
@UseGuards(JwtAuthGuard, ComercioMembershipGuard, SubscriptionGuard)
@Controller('comercios/:comercioId/availability')
export class ComercioAvailabilityController {
  constructor(private readonly availability: AvailabilityService) {}

  @ApiOperation({ summary: 'Calcular slots disponibles del profesional en este comercio' })
  @ApiResponse({ status: 200, description: 'Lista de slots libres (startAt/endAt en UTC ISO)' })
  @Get('slots')
  computeSlots(
    @CurrentMembership() membershipId: string,
    @Query() query: ComercioSlotsQueryDto,
  ) {
    return this.availability.computeSlotsByMembership(
      membershipId,
      query.serviceId,
      query.from,
      query.to,
    );
  }

  @ApiOperation({ summary: 'Listar reglas de horario (con serviceIds; vacío = todos)' })
  @ApiResponse({ status: 200, type: ScheduleRule, isArray: true })
  @Get('schedule')
  listSchedule(@CurrentMembership() membershipId: string) {
    return this.availability.listScheduleRulesByMembership(membershipId);
  }

  @ApiOperation({
    summary: 'Crear regla de horario (serviceIds opcional: aplica a esos servicios o a todos)',
  })
  @ApiResponse({ status: 201, type: ScheduleRule })
  @Post('schedule')
  createScheduleRule(
    @CurrentMembership() membershipId: string,
    @Body() dto: CreateScheduleRuleDto,
  ) {
    return this.availability.createScheduleRuleForMembership(membershipId, dto);
  }

  @ApiOperation({ summary: 'Editar regla de horario in-place (incluye remapear serviceIds)' })
  @ApiResponse({ status: 200, type: ScheduleRule })
  @ApiResponse({ status: 404, description: 'No encontrado' })
  @Patch('schedule/:id')
  updateScheduleRule(
    @CurrentMembership() membershipId: string,
    @Param('id') id: string,
    @Body() dto: UpdateScheduleRuleDto,
  ) {
    return this.availability.updateScheduleRuleForMembership(membershipId, id, dto);
  }

  @ApiOperation({ summary: 'Eliminar regla de horario' })
  @ApiResponse({ status: 204, description: 'Regla eliminada' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete('schedule/:id')
  deleteScheduleRule(@CurrentMembership() membershipId: string, @Param('id') id: string) {
    return this.availability.deleteScheduleRuleByMembership(membershipId, id);
  }

  @ApiOperation({ summary: 'Listar bloqueos de tiempo' })
  @ApiResponse({ status: 200, type: TimeOff, isArray: true })
  @Get('time-off')
  listTimeOff(@CurrentMembership() membershipId: string) {
    return this.availability.listTimeOffByMembership(membershipId);
  }

  @ApiOperation({ summary: 'Crear bloqueo de tiempo' })
  @ApiResponse({ status: 201, type: TimeOff })
  @Post('time-off')
  createTimeOff(@CurrentMembership() membershipId: string, @Body() dto: CreateTimeOffDto) {
    return this.availability.createTimeOffForMembership(membershipId, dto);
  }

  @ApiOperation({ summary: 'Eliminar bloqueo de tiempo' })
  @ApiResponse({ status: 204, description: 'Bloqueo eliminado' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete('time-off/:id')
  deleteTimeOff(@CurrentMembership() membershipId: string, @Param('id') id: string) {
    return this.availability.deleteTimeOffByMembership(membershipId, id);
  }
}
