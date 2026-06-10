import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { AdminGuard } from '@/common/guards/admin.guard';
import { SubscriptionsService } from '@/modules/subscriptions/subscriptions.service';
import { Subscription } from '@/modules/subscriptions/entities/subscription.entity';
import { Professional } from '@/modules/professionals/entities/professional.entity';
import { AdminMetricsService } from './admin-metrics.service';
import { AdminMetricsDto } from './dto/admin-metrics.dto';

/**
 * Endpoints de administracion de la plataforma (solo platform admin).
 */
@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin')
export class AdminController {
  constructor(
    private readonly subscriptions: SubscriptionsService,
    private readonly adminMetrics: AdminMetricsService,
    @InjectRepository(Professional)
    private readonly professionals: Repository<Professional>,
    @InjectRepository(Subscription)
    private readonly subs: Repository<Subscription>,
  ) {}

  @ApiOperation({ summary: 'Metricas de la plataforma (agregado de todos los tenants)' })
  @ApiResponse({ status: 200, type: AdminMetricsDto })
  @ApiResponse({ status: 403, description: 'Solo admin' })
  @Get('metrics')
  metrics(): Promise<AdminMetricsDto> {
    return this.adminMetrics.getMetrics();
  }

  @ApiOperation({ summary: 'Listar profesionales con su suscripcion' })
  @ApiResponse({ status: 200, description: 'Array de { professional, subscription }' })
  @ApiResponse({ status: 403, description: 'Solo admin' })
  @Get('professionals')
  async listProfessionals(): Promise<
    Array<{ professional: Professional; subscription: Subscription | null }>
  > {
    const [professionals, subscriptions] = await Promise.all([
      this.professionals.find({ order: { createdAt: 'DESC' } }),
      this.subs.find(),
    ]);
    const byTenant = new Map(subscriptions.map((s) => [s.professionalId, s]));
    return professionals.map((professional) => ({
      professional,
      subscription: byTenant.get(professional.id) ?? null,
    }));
  }

  @ApiOperation({
    summary: 'Marcar el pago en efectivo de la suscripcion de un profesional (renueva 30 dias)',
  })
  @ApiResponse({ status: 201, type: Subscription })
  @ApiResponse({ status: 403, description: 'Solo admin' })
  @ApiResponse({ status: 404, description: 'Suscripcion no encontrada' })
  @Post('subscriptions/:professionalId/mark-cash-paid')
  async markCashPaid(@Param('professionalId') professionalId: string): Promise<Subscription> {
    return this.subscriptions.markCashPaid(professionalId);
  }
}
