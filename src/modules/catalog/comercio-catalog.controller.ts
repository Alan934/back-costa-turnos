import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { SubscriptionGuard } from '@/common/guards/subscription.guard';
import { ComercioMembershipGuard } from '@/common/guards/comercio-membership.guard';
import { CurrentMembership } from '@/common/decorators/current-comercio.decorator';
import { CatalogService } from './catalog.service';
import { ServiceCombinationRulesService } from './service-combination-rules.service';
import { Service } from './entities/service.entity';
import { ServiceCombinationRule } from './entities/service-combination-rule.entity';
import { CreateServiceDto, UpdateServiceDto } from './dto/service.dto';
import { CreateCombinationRuleDto } from './dto/service-combination-rule.dto';

/**
 * Servicios/precios del profesional EN UN COMERCIO. El ComercioMembershipGuard
 * valida que el profesional (worker) tenga membresía activa en `:comercioId` y
 * resuelve `membershipId`. La suscripción se evalúa por el worker.
 *
 * `@ApiParam(comercioId)` declara el path param en el contrato (lo consume el
 * guard, no un handler). Los operationId salen de la fábrica global
 * (controller+método), únicos respecto al catálogo legacy.
 */
@ApiTags('catalog')
@ApiBearerAuth()
@ApiParam({ name: 'comercioId', format: 'uuid', description: 'Comercio donde opera el profesional' })
@UseGuards(JwtAuthGuard, ComercioMembershipGuard, SubscriptionGuard)
@Controller('comercios/:comercioId/services')
export class ComercioCatalogController {
  constructor(
    private readonly catalog: CatalogService,
    private readonly combinationRules: ServiceCombinationRulesService,
  ) {}

  @ApiOperation({ summary: 'Listar servicios del profesional en este comercio' })
  @ApiResponse({ status: 200, type: Service, isArray: true })
  @Get()
  list(@CurrentMembership() membershipId: string) {
    return this.catalog.listAllByMembership(membershipId);
  }

  @ApiOperation({ summary: 'Crear un servicio del profesional en este comercio' })
  @ApiResponse({ status: 201, type: Service })
  @Post()
  create(@CurrentMembership() membershipId: string, @Body() dto: CreateServiceDto) {
    return this.catalog.createForMembership(membershipId, dto);
  }

  // ---- Reglas de combinación de servicios ----
  // IMPORTANTE: estas rutas con segmento literal `combination-rules` deben ir ANTES
  // que las rutas con `:id`/`:ruleId`, o NestJS las matchea como `:id` (y rompe al
  // intentar castear "combination-rules" a uuid).

  @ApiOperation({ summary: 'Listar reglas de combinación de la membresía' })
  @ApiResponse({ status: 200, type: ServiceCombinationRule, isArray: true })
  @Get('combination-rules')
  listRules(@CurrentMembership() membershipId: string) {
    return this.combinationRules.listByMembership(membershipId);
  }

  @ApiOperation({ summary: 'Crear una regla de combinación entre dos servicios' })
  @ApiResponse({ status: 201, type: ServiceCombinationRule })
  @ApiResponse({ status: 400, description: 'Datos inválidos o servicios en membresías distintas' })
  @ApiResponse({ status: 409, description: 'Ya existe una regla de este tipo entre estos servicios' })
  @Post('combination-rules')
  createRule(
    @CurrentMembership() membershipId: string,
    @Body() dto: CreateCombinationRuleDto,
  ) {
    return this.combinationRules.create(membershipId, dto);
  }

  @ApiOperation({ summary: 'Eliminar una regla de combinación' })
  @ApiResponse({ status: 200, description: 'Regla eliminada' })
  @ApiResponse({ status: 404, description: 'No encontrada' })
  @Delete('combination-rules/:ruleId')
  deleteRule(@CurrentMembership() membershipId: string, @Param('ruleId') ruleId: string) {
    return this.combinationRules.delete(membershipId, ruleId);
  }

  @ApiOperation({ summary: 'Obtener un servicio por id (en este comercio)' })
  @ApiResponse({ status: 200, type: Service })
  @ApiResponse({ status: 404, description: 'No encontrado' })
  @Get(':id')
  get(@CurrentMembership() membershipId: string, @Param('id') id: string) {
    return this.catalog.findByMembership(membershipId, id);
  }

  @ApiOperation({ summary: 'Actualizar un servicio (en este comercio)' })
  @ApiResponse({ status: 200, type: Service })
  @ApiResponse({ status: 404, description: 'No encontrado' })
  @Patch(':id')
  update(
    @CurrentMembership() membershipId: string,
    @Param('id') id: string,
    @Body() dto: UpdateServiceDto,
  ) {
    return this.catalog.updateByMembership(membershipId, id, dto);
  }

  @ApiOperation({ summary: 'Desactivar un servicio (en este comercio)' })
  @ApiResponse({ status: 200, type: Service })
  @ApiResponse({ status: 404, description: 'No encontrado' })
  @Delete(':id')
  deactivate(@CurrentMembership() membershipId: string, @Param('id') id: string) {
    return this.catalog.deactivateByMembership(membershipId, id);
  }
}
