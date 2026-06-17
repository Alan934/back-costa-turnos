import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { SubscriptionGuard } from '@/common/guards/subscription.guard';
import { ComercioAccessGuard } from '@/common/guards/comercio-access.guard';
import {
  CurrentComercio,
  OptionalMembership,
} from '@/common/decorators/current-comercio.decorator';
import { CatalogService } from './catalog.service';
import { ServiceCombinationRulesService } from './service-combination-rules.service';
import { Service } from './entities/service.entity';
import { ServiceCombinationRule } from './entities/service-combination-rule.entity';
import { CreateServiceDto, UpdateServiceDto } from './dto/service.dto';
import { CreateCombinationRuleDto } from './dto/service-combination-rule.dto';

/**
 * Servicios del COMERCIO, asignados a N profesionales (membresías). El
 * ComercioAccessGuard permite al comercial dueño o a un profesional miembro y
 * resuelve `comercioId` (+ `membershipId` si es miembro).
 *
 * `@ApiParam(comercioId)` declara el path param en el contrato (lo consume el
 * guard, no un handler).
 */
@ApiTags('catalog')
@ApiBearerAuth()
@ApiParam({ name: 'comercioId', format: 'uuid', description: 'Comercio del catálogo' })
@UseGuards(JwtAuthGuard, ComercioAccessGuard, SubscriptionGuard)
@Controller('comercios/:comercioId/services')
export class ComercioCatalogController {
  constructor(
    private readonly catalog: CatalogService,
    private readonly combinationRules: ServiceCombinationRulesService,
  ) {}

  /** Las reglas de combinación las gestiona cada profesional (requiere membresía). */
  private requireMembership(membershipId: string | undefined): string {
    if (!membershipId) {
      throw new ForbiddenException(
        'Las reglas de combinación las gestiona cada profesional del comercio',
      );
    }
    return membershipId;
  }

  @ApiOperation({ summary: 'Listar servicios del comercio (con profesionales asignados)' })
  @ApiResponse({ status: 200, type: Service, isArray: true })
  @Get()
  list(@CurrentComercio() comercioId: string) {
    return this.catalog.listByComercio(comercioId);
  }

  @ApiOperation({
    summary: 'Crear un servicio del comercio',
    description:
      'Requiere `membershipIds` (≥1): los profesionales que ofrecen el servicio. Para habilitar ' +
      'seña/pago completo, todos los asignados deben tener MercadoPago conectado.',
  })
  @ApiResponse({ status: 201, type: Service })
  @ApiResponse({ status: 400, description: 'Sin profesionales asignados o datos inválidos' })
  @Post()
  create(@CurrentComercio() comercioId: string, @Body() dto: CreateServiceDto) {
    return this.catalog.createForComercio(comercioId, dto);
  }

  // ---- Reglas de combinación de servicios ----
  // IMPORTANTE: estas rutas con segmento literal `combination-rules` deben ir ANTES
  // que las rutas con `:id`/`:ruleId`, o NestJS las matchea como `:id` (y rompe al
  // intentar castear "combination-rules" a uuid).

  @ApiOperation({ summary: 'Listar reglas de combinación del profesional (miembro)' })
  @ApiResponse({ status: 200, type: ServiceCombinationRule, isArray: true })
  @ApiResponse({ status: 403, description: 'Solo para profesionales del comercio' })
  @Get('combination-rules')
  listRules(@OptionalMembership() membershipId: string | undefined) {
    return this.combinationRules.listByMembership(this.requireMembership(membershipId));
  }

  @ApiOperation({ summary: 'Crear una regla de combinación entre dos servicios' })
  @ApiResponse({ status: 201, type: ServiceCombinationRule })
  @ApiResponse({
    status: 400,
    description: 'Datos inválidos o servicios no ofrecidos por el profesional',
  })
  @ApiResponse({ status: 403, description: 'Solo para profesionales del comercio' })
  @ApiResponse({
    status: 409,
    description: 'Ya existe una regla de este tipo entre estos servicios',
  })
  @Post('combination-rules')
  createRule(
    @OptionalMembership() membershipId: string | undefined,
    @Body() dto: CreateCombinationRuleDto,
  ) {
    return this.combinationRules.create(this.requireMembership(membershipId), dto);
  }

  @ApiOperation({ summary: 'Eliminar una regla de combinación' })
  @ApiResponse({ status: 200, description: 'Regla eliminada' })
  @ApiResponse({ status: 403, description: 'Solo para profesionales del comercio' })
  @ApiResponse({ status: 404, description: 'No encontrada' })
  @Delete('combination-rules/:ruleId')
  deleteRule(
    @OptionalMembership() membershipId: string | undefined,
    @Param('ruleId') ruleId: string,
  ) {
    return this.combinationRules.delete(this.requireMembership(membershipId), ruleId);
  }

  @ApiOperation({ summary: 'Obtener un servicio del comercio por id' })
  @ApiResponse({ status: 200, type: Service })
  @ApiResponse({ status: 404, description: 'No encontrado' })
  @Get(':id')
  get(@CurrentComercio() comercioId: string, @Param('id') id: string) {
    return this.catalog.getForComercio(comercioId, id);
  }

  @ApiOperation({
    summary: 'Actualizar un servicio del comercio',
    description: '`membershipIds` (si viene) reemplaza el set completo de profesionales asignados.',
  })
  @ApiResponse({ status: 200, type: Service })
  @ApiResponse({ status: 404, description: 'No encontrado' })
  @Patch(':id')
  update(
    @CurrentComercio() comercioId: string,
    @Param('id') id: string,
    @Body() dto: UpdateServiceDto,
  ) {
    return this.catalog.updateForComercio(comercioId, id, dto);
  }

  @ApiOperation({ summary: 'Desactivar un servicio del comercio' })
  @ApiResponse({ status: 200, type: Service })
  @ApiResponse({ status: 404, description: 'No encontrado' })
  @Delete(':id')
  deactivate(@CurrentComercio() comercioId: string, @Param('id') id: string) {
    return this.catalog.deactivateForComercio(comercioId, id);
  }
}
