import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { TenantGuard } from '@/common/guards/tenant.guard';
import { SubscriptionGuard } from '@/common/guards/subscription.guard';
import { Roles } from '@/common/decorators/roles.decorator';
import { CurrentTenant } from '@/common/decorators/current-tenant.decorator';
import { AppRole } from '@/common/enums';
import { RafflesService } from './raffles.service';
import { Raffle } from './entities/raffle.entity';
import { RafflePrize } from './entities/raffle-prize.entity';
import { RaffleEntry } from './entities/raffle-entry.entity';
import {
  AddEntryDto,
  AddParticipantsByEmailDto,
  CreatePrizeDto,
  CreateRaffleDto,
} from './dto/raffle.dto';

@ApiTags('raffles')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard, SubscriptionGuard)
@Roles(AppRole.Professional)
@Controller('raffles')
export class RafflesController {
  constructor(private readonly raffles: RafflesService) {}

  @ApiOperation({ summary: 'Listar sorteos del tenant' })
  @ApiResponse({ status: 200, type: Raffle, isArray: true })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  @Get()
  list(@CurrentTenant() tenantId: string) {
    return this.raffles.list(tenantId);
  }

  @ApiOperation({ summary: 'Crear un sorteo' })
  @ApiResponse({ status: 201, type: Raffle })
  @ApiResponse({ status: 400, description: 'Datos invalidos' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  @Post()
  create(@CurrentTenant() tenantId: string, @Body() dto: CreateRaffleDto) {
    return this.raffles.create(tenantId, dto);
  }

  @ApiOperation({ summary: 'Obtener un sorteo por id' })
  @ApiResponse({ status: 200, type: Raffle })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  @ApiResponse({ status: 404, description: 'No encontrado' })
  @Get(':id')
  get(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.raffles.get(tenantId, id);
  }

  @ApiOperation({ summary: 'Agregar un premio al sorteo' })
  @ApiResponse({ status: 201, type: RafflePrize })
  @ApiResponse({ status: 400, description: 'Datos invalidos' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  @ApiResponse({ status: 404, description: 'No encontrado' })
  @Post(':id/prizes')
  addPrize(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: CreatePrizeDto,
  ) {
    return this.raffles.addPrize(tenantId, id, dto);
  }

  @ApiOperation({ summary: 'Listar las entradas del sorteo' })
  @ApiResponse({ status: 200, type: RaffleEntry, isArray: true })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  @ApiResponse({ status: 404, description: 'No encontrado' })
  @Get(':id/entries')
  listEntries(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.raffles.listEntries(tenantId, id);
  }

  @ApiOperation({ summary: 'Agregar una entrada al sorteo' })
  @ApiResponse({ status: 201, type: RaffleEntry })
  @ApiResponse({ status: 400, description: 'Datos invalidos' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  @ApiResponse({ status: 404, description: 'No encontrado' })
  @Post(':id/entries')
  addEntry(@CurrentTenant() tenantId: string, @Param('id') id: string, @Body() dto: AddEntryDto) {
    return this.raffles.addEntry(tenantId, id, dto);
  }

  @ApiOperation({ summary: 'Cargar participantes por email (emite codigo de reclamo)' })
  @ApiResponse({ status: 201, type: RaffleEntry, isArray: true })
  @ApiResponse({ status: 400, description: 'Datos invalidos' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  @ApiResponse({ status: 404, description: 'No encontrado' })
  @Post(':id/participants-by-email')
  addByEmail(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: AddParticipantsByEmailDto,
  ) {
    return this.raffles.addParticipantsByEmail(tenantId, id, dto);
  }

  @ApiOperation({ summary: 'Sortear un ganador y cerrar el sorteo' })
  @ApiResponse({ status: 201, type: Raffle })
  @ApiResponse({ status: 400, description: 'El sorteo ya finalizo o no tiene participantes' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  @ApiResponse({ status: 404, description: 'No encontrado' })
  @Post(':id/draw')
  draw(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.raffles.draw(tenantId, id);
  }
}
