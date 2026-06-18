import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiExcludeEndpoint,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { TenantGuard } from '@/common/guards/tenant.guard';
import { Roles } from '@/common/decorators/roles.decorator';
import { Public } from '@/common/decorators/public.decorator';
import { CurrentTenant } from '@/common/decorators/current-tenant.decorator';
import { AppRole } from '@/common/enums';
import { SubscriptionsService } from './subscriptions.service';
import { Subscription } from './entities/subscription.entity';
import { SubscriptionPayment } from './entities/subscription-payment.entity';

@ApiTags('subscriptions')
@Controller('subscription')
export class SubscriptionsController {
  constructor(private readonly subscriptions: SubscriptionsService) {}

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Obtener mi suscripcion' })
  @ApiResponse({ status: 200, type: Subscription })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(AppRole.Professional)
  @Get()
  async getMine(@CurrentTenant() tenantId: string) {
    return this.subscriptions.getByTenant(tenantId);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Listar pagos de la suscripcion' })
  @ApiResponse({ status: 200, type: SubscriptionPayment, isArray: true })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(AppRole.Professional)
  @Get('payments')
  async payments(@CurrentTenant() tenantId: string) {
    const sub = await this.subscriptions.getByTenant(tenantId);
    return this.subscriptions.listPayments(sub.id);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Crear el checkout de MercadoPago para pagar la suscripcion' })
  @ApiResponse({ status: 200, description: 'Objeto { initPoint } al que redirigir para pagar' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(AppRole.Professional)
  @HttpCode(HttpStatus.OK)
  @Post('checkout')
  async checkout(@CurrentTenant() tenantId: string) {
    return this.subscriptions.createCheckout(tenantId);
  }

  /** Webhook publico de MercadoPago para los pagos de suscripcion. */
  @Public()
  @ApiExcludeEndpoint()
  @HttpCode(HttpStatus.OK)
  @Post('mp/webhook')
  async webhook(@Body() payload: Record<string, unknown>): Promise<{ ok: true }> {
    await this.subscriptions.handleWebhook(payload);
    return { ok: true };
  }
}
