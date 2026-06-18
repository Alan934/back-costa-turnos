import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { TenantGuard } from '@/common/guards/tenant.guard';
import { Roles } from '@/common/decorators/roles.decorator';
import { Public } from '@/common/decorators/public.decorator';
import { CurrentTenant } from '@/common/decorators/current-tenant.decorator';
import { AppRole } from '@/common/enums';
import { PaymentsService } from './payments.service';
import { Payment } from './entities/payment.entity';
import { CreatePreferenceDto, DeferPaymentDto } from './dto/payment.dto';

@ApiTags('payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @ApiOperation({ summary: 'Listar pagos' })
  @ApiResponse({ status: 200, type: Payment, isArray: true })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(AppRole.Professional, AppRole.Staff)
  @Get()
  list(@CurrentTenant() tenantId: string) {
    return this.payments.list(tenantId);
  }

  @ApiOperation({ summary: 'Marcar pago en efectivo como cobrado' })
  @ApiResponse({ status: 200, type: Payment })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  @ApiResponse({ status: 404, description: 'No encontrado' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(AppRole.Professional, AppRole.Staff)
  @Post(':id/mark-paid')
  markPaid(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.payments.markCashPaid(tenantId, id);
  }

  @ApiOperation({ summary: 'Marcar pago en efectivo como pagaré (el cliente quedó debiendo)' })
  @ApiResponse({ status: 200, type: Payment })
  @ApiResponse({ status: 400, description: 'Datos invalidos' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  @ApiResponse({ status: 404, description: 'No encontrado' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(AppRole.Professional, AppRole.Staff)
  @Post(':id/mark-deferred')
  markDeferred(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() body: DeferPaymentDto,
  ) {
    return this.payments.markCashDeferred(tenantId, id, body.note);
  }

  @ApiOperation({ summary: 'Crear preferencia de pago de MercadoPago' })
  @ApiResponse({
    status: 201,
    description: 'Preferencia de MercadoPago con initPoint para redirigir al pago',
  })
  @ApiResponse({ status: 400, description: 'Datos invalidos' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  @ApiResponse({ status: 404, description: 'No encontrado' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(AppRole.Professional, AppRole.Staff)
  @Post(':id/mp-preference')
  createPreference(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() body: CreatePreferenceDto,
  ) {
    return this.payments.createMercadoPagoPreference(tenantId, id, body.payerEmail);
  }

  /** Webhook publico de MercadoPago (idempotente). */
  @ApiOperation({ summary: 'Webhook publico de MercadoPago' })
  @ApiBody({ schema: { type: 'object', additionalProperties: true } })
  @ApiResponse({ status: 200, description: 'Acuse de recibo { ok: true }' })
  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('mp/webhook')
  async webhook(@Body() payload: Record<string, unknown>): Promise<{ ok: true }> {
    await this.payments.handleWebhook(payload);
    return { ok: true };
  }
}
