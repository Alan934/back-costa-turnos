import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { TenantGuard } from '@/common/guards/tenant.guard';
import { SubscriptionGuard } from '@/common/guards/subscription.guard';
import { Roles } from '@/common/decorators/roles.decorator';
import { CurrentTenant } from '@/common/decorators/current-tenant.decorator';
import { AppRole } from '@/common/enums';
import { CatalogService } from './catalog.service';
import { Service } from './entities/service.entity';
import { CreateServiceDto, UpdateServiceDto } from './dto/service.dto';

@ApiTags('catalog')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard, SubscriptionGuard)
@Roles(AppRole.Professional, AppRole.Staff)
@Controller('services')
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @ApiOperation({ summary: 'Listar servicios del catalogo' })
  @ApiResponse({ status: 200, type: Service, isArray: true })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  @Get()
  list(@CurrentTenant() tenantId: string) {
    return this.catalog.listAll(tenantId);
  }

  @ApiOperation({ summary: 'Crear un servicio' })
  @ApiResponse({ status: 201, type: Service })
  @ApiResponse({ status: 400, description: 'Datos invalidos' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  @Post()
  @Roles(AppRole.Professional)
  create(@CurrentTenant() tenantId: string, @Body() dto: CreateServiceDto) {
    return this.catalog.create(tenantId, dto);
  }

  @ApiOperation({ summary: 'Obtener un servicio por id' })
  @ApiResponse({ status: 200, type: Service })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  @ApiResponse({ status: 404, description: 'No encontrado' })
  @Get(':id')
  get(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.catalog.findById(tenantId, id);
  }

  @ApiOperation({ summary: 'Actualizar un servicio' })
  @ApiResponse({ status: 200, type: Service })
  @ApiResponse({ status: 400, description: 'Datos invalidos' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  @ApiResponse({ status: 404, description: 'No encontrado' })
  @Patch(':id')
  @Roles(AppRole.Professional)
  update(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateServiceDto,
  ) {
    return this.catalog.update(tenantId, id, dto);
  }

  @ApiOperation({ summary: 'Desactivar un servicio' })
  @ApiResponse({ status: 200, type: Service })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  @ApiResponse({ status: 404, description: 'No encontrado' })
  @Delete(':id')
  @Roles(AppRole.Professional)
  deactivate(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.catalog.deactivate(tenantId, id);
  }
}
