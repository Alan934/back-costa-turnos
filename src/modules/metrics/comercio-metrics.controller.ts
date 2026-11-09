import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ComercioOwnerGuard } from '@/common/guards/comercio-owner.guard';
import { CurrentAccount } from '@/common/decorators/current-account.decorator';
import { CurrentComercio } from '@/common/decorators/current-comercio.decorator';
import { MetricsService } from './metrics.service';
import { ComercioTeamMetricsDto, MetricsPeriodQueryDto, MetricsRange } from './dto/metrics.dto';

/**
 * Métricas del equipo para el dueño del comercio. La plata de cada profesional solo viaja si
 * ese profesional la comparte; lo decide él en su membresía (`shareIncomeWithComercio`).
 */
@ApiTags('comercios')
@ApiBearerAuth()
@Controller('comercios/:comercioId/metrics')
export class ComercioMetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @ApiOperation({ summary: 'Métricas del equipo del comercio (dueño del comercio)' })
  @ApiResponse({ status: 200, type: ComercioTeamMetricsDto })
  @ApiResponse({ status: 403, description: 'No administrás este comercio' })
  @ApiParam({ name: 'comercioId', format: 'uuid' })
  @UseGuards(ComercioOwnerGuard)
  @Get()
  team(
    @CurrentComercio() comercioId: string,
    @CurrentAccount('sub') accountId: string,
    @Query() query: MetricsPeriodQueryDto,
  ): Promise<ComercioTeamMetricsDto> {
    return this.metrics.getComercioTeam(
      comercioId,
      accountId,
      query.range ?? MetricsRange.Week,
      query.offset ?? 0,
    );
  }
}
