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
import { ChargeService } from './charge.service';
import { CurrentAccount } from '@/common/decorators/current-account.decorator';
import { Payment } from './entities/payment.entity';
import { CreatePreferenceDto, DeferPaymentDto } from './dto/payment.dto';
import {
  ChargePaymentDto,
  ChargeQrDto,
  ChargeSummaryDto,
  MarkChargePaidDto,
  PaymentAuditEntryDto,
  RevertPaymentDto,
} from './dto/charge.dto';

@ApiTags('payments')
@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly charge: ChargeService,
  ) {}

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
  markPaid(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @CurrentAccount('sub') accountId: string,
  ) {
    return this.payments.markCashPaid(tenantId, id, accountId);
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
    @CurrentAccount('sub') accountId: string,
  ) {
    return this.payments.markCashDeferred(tenantId, id, body.note, accountId);
  }

  // ---- Cobro de un turno (sala de espera) ----

  @ApiOperation({
    summary: 'Cuánto vale el turno, cuánto se cobró y cuánto falta',
    description:
      'Base sin IVA + lo que pagaría el cliente por Mercado Pago (con IVA). Se consulta cada ' +
      'pocos segundos mientras el cliente escanea el QR para ver cuándo se acredita.',
  })
  @ApiResponse({ status: 200, type: ChargeSummaryDto })
  @ApiResponse({ status: 400, description: 'Turno cancelado o sin presentarse' })
  @ApiResponse({ status: 404, description: 'No encontrado' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(AppRole.Professional, AppRole.Staff)
  @Get('appointment/:appointmentId/charge')
  chargeSummary(@CurrentTenant() tenantId: string, @Param('appointmentId') appointmentId: string) {
    return this.charge.summary(tenantId, appointmentId);
  }

  @ApiOperation({
    summary: 'QR de cobro por Mercado Pago a la cuenta del profesional',
    description:
      'Devuelve el initPoint con el monto exacto que falta. El cliente lo escanea y paga; el ' +
      'webhook marca el pago.',
  })
  @ApiResponse({ status: 201, type: ChargeQrDto })
  @ApiResponse({ status: 400, description: 'Nada para cobrar / Mercado Pago no conectado' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(AppRole.Professional, AppRole.Staff)
  @Post('appointment/:appointmentId/charge/qr')
  chargeQr(
    @CurrentTenant() tenantId: string,
    @Param('appointmentId') appointmentId: string,
    @CurrentAccount('sub') accountId: string,
  ) {
    return this.charge.createQr(tenantId, accountId, appointmentId);
  }

  @ApiOperation({
    summary: 'El cliente ya pagó (efectivo, transferencia o pagó antes)',
    description: 'Idempotente: si ya no falta nada no crea otro pago.',
  })
  @ApiResponse({ status: 201, type: ChargeSummaryDto })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(AppRole.Professional, AppRole.Staff)
  @Post('appointment/:appointmentId/charge/paid')
  chargePaid(
    @CurrentTenant() tenantId: string,
    @Param('appointmentId') appointmentId: string,
    @Body() body: MarkChargePaidDto,
    @CurrentAccount('sub') accountId: string,
  ) {
    return this.charge.markPaid(tenantId, accountId, appointmentId, body.method, body.note);
  }

  @ApiOperation({ summary: 'Pagaré: el cliente quedó debiendo lo que falta' })
  @ApiResponse({ status: 201, type: ChargeSummaryDto })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(AppRole.Professional, AppRole.Staff)
  @Post('appointment/:appointmentId/charge/deferred')
  chargeDeferred(
    @CurrentTenant() tenantId: string,
    @Param('appointmentId') appointmentId: string,
    @Body() body: DeferPaymentDto,
    @CurrentAccount('sub') accountId: string,
  ) {
    return this.charge.markDeferred(tenantId, accountId, appointmentId, body.note);
  }

  @ApiOperation({
    summary: 'Deshacer un cobro marcado como pagado (me equivoqué)',
    description:
      'Solo cobros manuales (efectivo/transferencia). Vuelve a pendiente de cobro. Exige un ' +
      'motivo y queda registrado con quién y cuándo. Mercado Pago no se deshace desde acá.',
  })
  @ApiResponse({ status: 201, type: ChargePaymentDto })
  @ApiResponse({ status: 400, description: 'No es un cobro manual pagado' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(AppRole.Professional, AppRole.Staff)
  @Post(':id/revert')
  revert(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() body: RevertPaymentDto,
    @CurrentAccount('sub') accountId: string,
  ) {
    return this.charge.revert(tenantId, accountId, id, body.reason);
  }

  @ApiOperation({ summary: 'Historial de un pago: quién hizo qué y cuándo' })
  @ApiResponse({ status: 200, type: PaymentAuditEntryDto, isArray: true })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(AppRole.Professional, AppRole.Staff)
  @Get(':id/audit')
  audit(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.charge.auditOf(tenantId, id);
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
