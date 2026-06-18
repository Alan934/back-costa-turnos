import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { TenantGuard } from '@/common/guards/tenant.guard';
import { Roles } from '@/common/decorators/roles.decorator';
import { CurrentTenant } from '@/common/decorators/current-tenant.decorator';
import { AppRole } from '@/common/enums';
import { MetricsRange } from '@/modules/metrics/dto/metrics.dto';
import { CashClosingService } from './cash-closing.service';
import { CashClosingDto, CashClosingQueryDto } from './dto/cash-closing.dto';

@ApiTags('cash-closing')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
@Roles(AppRole.Professional, AppRole.Staff)
@Controller('cash-closing')
export class CashClosingController {
  constructor(private readonly cashClosing: CashClosingService) {}

  @ApiOperation({
    summary: 'Cierre de caja del profesional',
    description:
      'Turnos pasados sin cerrar, pagos en efectivo sin cobrar (pendientes y pagarés) y total ' +
      'de efectivo cobrado en el período.',
  })
  @ApiResponse({ status: 200, type: CashClosingDto })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  @Get()
  get(
    @CurrentTenant() tenantId: string,
    @Query() query: CashClosingQueryDto,
  ): Promise<CashClosingDto> {
    return this.cashClosing.getClosing(tenantId, query.range ?? MetricsRange.Week);
  }
}
