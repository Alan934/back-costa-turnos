import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { TenantGuard } from '@/common/guards/tenant.guard';
import { Roles } from '@/common/decorators/roles.decorator';
import { CurrentTenant } from '@/common/decorators/current-tenant.decorator';
import { AppRole } from '@/common/enums';
import { MetricsService } from './metrics.service';
import { MetricsOverviewDto, MetricsQueryDto, MetricsRange } from './dto/metrics.dto';

@ApiTags('metrics')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
@Roles(AppRole.Professional, AppRole.Staff)
@Controller('metrics')
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @ApiOperation({ summary: 'Metricas del negocio del profesional' })
  @ApiResponse({ status: 200, type: MetricsOverviewDto })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  @Get('overview')
  overview(
    @CurrentTenant() tenantId: string,
    @Query() query: MetricsQueryDto,
  ): Promise<MetricsOverviewDto> {
    return this.metrics.getOverview(tenantId, query.range ?? MetricsRange.Week);
  }
}
