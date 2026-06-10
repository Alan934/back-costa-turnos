import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { TenantGuard } from '@/common/guards/tenant.guard';
import { SubscriptionGuard } from '@/common/guards/subscription.guard';
import { Roles } from '@/common/decorators/roles.decorator';
import { CurrentTenant } from '@/common/decorators/current-tenant.decorator';
import { AppRole } from '@/common/enums';
import { AvailabilityService } from './availability.service';
import { ScheduleRule } from './entities/schedule-rule.entity';
import { TimeOff } from './entities/time-off.entity';
import {
  AvailabilityQueryDto,
  CreateScheduleRuleDto,
  CreateTimeOffDto,
} from './dto/availability.dto';

@ApiTags('availability')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard, SubscriptionGuard)
@Roles(AppRole.Professional, AppRole.Staff)
@Controller('availability')
export class AvailabilityController {
  constructor(private readonly availability: AvailabilityService) {}

  @ApiOperation({ summary: 'Calcular slots disponibles' })
  @ApiResponse({
    status: 200,
    description: 'Lista de slots libres calculados (startAt/endAt en UTC ISO)',
  })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  @Get('slots')
  computeSlots(@CurrentTenant() tenantId: string, @Query() query: AvailabilityQueryDto) {
    return this.availability.computeSlots(
      tenantId,
      query.staffId,
      query.serviceId,
      query.from,
      query.to,
    );
  }

  @ApiOperation({ summary: 'Listar reglas de horario del staff' })
  @ApiResponse({ status: 200, type: ScheduleRule, isArray: true })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  @ApiResponse({ status: 404, description: 'No encontrado' })
  @Get('staff/:staffId/schedule')
  listSchedule(@CurrentTenant() tenantId: string, @Param('staffId') staffId: string) {
    return this.availability.listScheduleRules(tenantId, staffId);
  }

  @ApiOperation({ summary: 'Crear regla de horario para el staff' })
  @ApiResponse({ status: 201, type: ScheduleRule })
  @ApiResponse({ status: 400, description: 'Datos invalidos' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  @ApiResponse({ status: 404, description: 'No encontrado' })
  @Post('staff/:staffId/schedule')
  createScheduleRule(
    @CurrentTenant() tenantId: string,
    @Param('staffId') staffId: string,
    @Body() dto: CreateScheduleRuleDto,
  ) {
    return this.availability.createScheduleRule(tenantId, staffId, dto);
  }

  @ApiOperation({ summary: 'Eliminar regla de horario del staff' })
  @ApiResponse({ status: 204, description: 'Regla eliminada' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  @ApiResponse({ status: 404, description: 'No encontrado' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete('staff/:staffId/schedule/:id')
  deleteScheduleRule(
    @CurrentTenant() tenantId: string,
    @Param('staffId') staffId: string,
    @Param('id') id: string,
  ) {
    return this.availability.deleteScheduleRule(tenantId, staffId, id);
  }

  @ApiOperation({ summary: 'Listar bloqueos de tiempo del staff' })
  @ApiResponse({ status: 200, type: TimeOff, isArray: true })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  @ApiResponse({ status: 404, description: 'No encontrado' })
  @Get('staff/:staffId/time-off')
  listTimeOff(@CurrentTenant() tenantId: string, @Param('staffId') staffId: string) {
    return this.availability.listTimeOff(tenantId, staffId);
  }

  @ApiOperation({ summary: 'Crear bloqueo de tiempo para el staff' })
  @ApiResponse({ status: 201, type: TimeOff })
  @ApiResponse({ status: 400, description: 'Datos invalidos' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  @ApiResponse({ status: 404, description: 'No encontrado' })
  @Post('staff/:staffId/time-off')
  createTimeOff(
    @CurrentTenant() tenantId: string,
    @Param('staffId') staffId: string,
    @Body() dto: CreateTimeOffDto,
  ) {
    return this.availability.createTimeOff(tenantId, staffId, dto);
  }

  @ApiOperation({ summary: 'Eliminar bloqueo de tiempo del staff' })
  @ApiResponse({ status: 204, description: 'Bloqueo eliminado' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  @ApiResponse({ status: 404, description: 'No encontrado' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete('staff/:staffId/time-off/:id')
  deleteTimeOff(
    @CurrentTenant() tenantId: string,
    @Param('staffId') staffId: string,
    @Param('id') id: string,
  ) {
    return this.availability.deleteTimeOff(tenantId, staffId, id);
  }
}
