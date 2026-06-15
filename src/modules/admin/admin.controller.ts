import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { AdminGuard } from '@/common/guards/admin.guard';
import { AccountStatus, VerificationPurpose } from '@/common/enums';
import { AuthService } from '@/modules/auth/auth.service';
import { AccountsService } from '@/modules/identity/accounts.service';
import { Account } from '@/modules/identity/entities/account.entity';
import { ProfessionalsService } from '@/modules/professionals/professionals.service';
import { ClientsService } from '@/modules/clients/clients.service';
import { EnrichedClientDto } from '@/modules/clients/dto/enriched-client.dto';
import { SubscriptionsService } from '@/modules/subscriptions/subscriptions.service';
import { Subscription } from '@/modules/subscriptions/entities/subscription.entity';
import { Professional } from '@/modules/professionals/entities/professional.entity';
import { ComerciosService } from '@/modules/comercios/comercios.service';
import { Comercio } from '@/modules/comercios/entities/comercio.entity';
import { CreateComercialDto } from '@/modules/comercios/dto/comercio.dto';
import { CurrentAccount } from '@/common/decorators/current-account.decorator';
import { AuthenticatedRequest } from '@/common/types/request-user';
import { PaginationQueryDto } from '@/common/dto/paginated.dto';
import { AdminMetricsService } from './admin-metrics.service';
import { AdminMetricsDto } from './dto/admin-metrics.dto';
import { AdminCreateClientDto, AdminCreateProfessionalDto } from './dto/admin-manage.dto';
import { AdminDeletionService } from './admin-deletion.service';
import { AdminListService } from './admin-list.service';
import {
  AdminClientPageDto,
  AdminComercioPageDto,
  AdminProfessionalPageDto,
} from './dto/admin-list.dto';

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
    private readonly accounts: AccountsService,
    private readonly auth: AuthService,
    private readonly professionalsService: ProfessionalsService,
    private readonly clients: ClientsService,
    private readonly comercios: ComerciosService,
    private readonly deletion: AdminDeletionService,
    private readonly lists: AdminListService,
  ) {}

  private clientIp(req: AuthenticatedRequest): string | null {
    return req.ip ?? null;
  }

  // ---- Comercios (solo admin crea cuentas comerciales) ----
  @ApiOperation({
    summary: 'Crear una cuenta comercial + su comercio',
    description: 'Crea el account (email+password) con rol comercial y su comercio asociado.',
  })
  @ApiResponse({ status: 201, type: Comercio })
  @ApiResponse({ status: 403, description: 'Solo admin' })
  @ApiResponse({ status: 409, description: 'Email ya reclamado o slug en uso' })
  @Post('comercios')
  createComercial(@Body() dto: CreateComercialDto): Promise<Comercio> {
    return this.comercios.createComercialWithComercio(dto);
  }

  @ApiOperation({ summary: 'Metricas de la plataforma (agregado de todos los tenants)' })
  @ApiResponse({ status: 200, type: AdminMetricsDto })
  @ApiResponse({ status: 403, description: 'Solo admin' })
  @Get('metrics')
  metrics(): Promise<AdminMetricsDto> {
    return this.adminMetrics.getMetrics();
  }

  @ApiOperation({
    summary: 'Listar profesionales (paginado, con busqueda y filtro de estado)',
    description:
      'Devuelve { items, total, page, pageSize }. Cada item es { professional, subscription }. ' +
      '`professional.deletedAt` (null = activo) marca los eliminados. `q` busca por nombre/slug. ' +
      '`status` = active | deleted | all (default all). El total respeta el filtro (conteos por pestaña).',
  })
  @ApiResponse({ status: 200, type: AdminProfessionalPageDto })
  @ApiResponse({ status: 403, description: 'Solo admin' })
  @Get('professionals')
  listProfessionals(@Query() query: PaginationQueryDto): Promise<AdminProfessionalPageDto> {
    return this.lists.listProfessionals(query);
  }

  @ApiOperation({
    summary: 'Listar TODOS los clientes de la plataforma (paginado, busqueda y filtro de estado)',
    description:
      'Listado global (todos los tenants). `id` es el del vinculo professional_client (usalo en ' +
      'DELETE /admin/clients/:id). `deletedAt` no-null = eliminado. `q` busca por nombre/email/telefono. ' +
      '`status` = active | deleted | all (default all). El total respeta el filtro (conteos por pestaña).',
  })
  @ApiResponse({ status: 200, type: AdminClientPageDto })
  @ApiResponse({ status: 403, description: 'Solo admin' })
  @Get('clients')
  listClients(@Query() query: PaginationQueryDto): Promise<AdminClientPageDto> {
    return this.lists.listClients(query);
  }

  @ApiOperation({
    summary: 'Listar TODOS los comercios de la plataforma (paginado, busqueda y filtro de estado)',
    description:
      'Listado global. Cada item es { comercio, ownerEmail, activeMembers }. ' +
      '`comercio.deletedAt` no-null = eliminado. `q` busca por nombre/slug. ' +
      '`status` = active | deleted | all (default all). El total respeta el filtro (conteos por pestaña).',
  })
  @ApiResponse({ status: 200, type: AdminComercioPageDto })
  @ApiResponse({ status: 403, description: 'Solo admin' })
  @Get('comercios')
  listComercios(@Query() query: PaginationQueryDto): Promise<AdminComercioPageDto> {
    return this.lists.listComercios(query);
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

  // ---- Alta de profesionales y clientes ----
  @ApiOperation({
    summary: 'Crear un profesional (cuenta sin reclamar + negocio + suscripcion trial)',
    description:
      'Crea la cuenta sin password; el profesional luego la reclama con codigo (/auth/request-claim-code + /auth/claim) para setear su contrasena.',
  })
  @ApiResponse({ status: 201, type: Professional })
  @ApiResponse({ status: 403, description: 'Solo admin' })
  @ApiResponse({ status: 409, description: 'Email ya reclamado o slug en uso' })
  @Post('professionals')
  async createProfessional(@Body() dto: AdminCreateProfessionalDto): Promise<Professional> {
    const account = await this.accounts.findOrCreateUnclaimed(dto.email);
    const professional = await this.professionalsService.onboard(account.id, {
      businessName: dto.businessName,
      slug: dto.slug,
    });
    // Si la cuenta aun no fue reclamada, le enviamos el codigo para que defina su password.
    if (!account.isClaimed) {
      await this.auth.requestCode(dto.email, VerificationPurpose.AccountClaim);
    }
    return professional;
  }

  @ApiOperation({ summary: 'Crear un cliente y asignarlo a un profesional' })
  @ApiResponse({ status: 201, type: EnrichedClientDto })
  @ApiResponse({ status: 400, description: 'La persona ya es cliente del profesional' })
  @ApiResponse({ status: 403, description: 'Solo admin' })
  @Post('clients')
  async createClient(@Body() dto: AdminCreateClientDto): Promise<EnrichedClientDto> {
    return this.clients.createClient(dto.professionalId, {
      fullName: dto.fullName,
      email: dto.email,
      phone: dto.phone,
    });
  }

  // ---- Bloqueo / reactivacion de cuentas ----
  @ApiOperation({ summary: 'Bloquear una cuenta (revoca su sesion)' })
  @ApiResponse({ status: 201, type: Account })
  @ApiResponse({ status: 403, description: 'Solo admin' })
  @ApiResponse({ status: 404, description: 'Cuenta no encontrada' })
  @Post('accounts/:accountId/block')
  blockAccount(@Param('accountId') accountId: string): Promise<Account> {
    return this.accounts.setStatus(accountId, AccountStatus.Blocked);
  }

  @ApiOperation({ summary: 'Reactivar una cuenta bloqueada' })
  @ApiResponse({ status: 201, type: Account })
  @ApiResponse({ status: 403, description: 'Solo admin' })
  @ApiResponse({ status: 404, description: 'Cuenta no encontrada' })
  @Post('accounts/:accountId/activate')
  activateAccount(@Param('accountId') accountId: string): Promise<Account> {
    return this.accounts.setStatus(accountId, AccountStatus.Active);
  }

  // ---- Eliminacion logica (soft-delete) de actores ----
  // El borrado es LOGICO: marca deleted_at, conserva el historial (turnos/pagos),
  // bloquea la cuenta del actor y queda auditado. Restaurable con /restore.

  @ApiOperation({
    summary: 'Eliminar (logico) un profesional y su agenda; bloquea su cuenta',
    description:
      'Soft-borra el professional y sus membresias/servicios/horarios/clientes/staff. ' +
      'NO borra turnos ni pagos (historial). Bloquea la cuenta y revoca su sesion.',
  })
  @ApiResponse({ status: 204, description: 'Eliminado' })
  @ApiResponse({ status: 403, description: 'Solo admin' })
  @ApiResponse({ status: 404, description: 'Professional no encontrado' })
  @Delete('professionals/:id')
  @HttpCode(204)
  async deleteProfessional(
    @Param('id') id: string,
    @CurrentAccount('sub') adminAccountId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<void> {
    await this.deletion.deleteProfessional(id, adminAccountId, this.clientIp(req));
  }

  @ApiOperation({ summary: 'Restaurar un profesional eliminado (y reactivar su cuenta)' })
  @ApiResponse({ status: 204, description: 'Restaurado' })
  @ApiResponse({ status: 403, description: 'Solo admin' })
  @ApiResponse({ status: 404, description: 'Professional no encontrado' })
  @Post('professionals/:id/restore')
  @HttpCode(204)
  async restoreProfessional(
    @Param('id') id: string,
    @CurrentAccount('sub') adminAccountId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<void> {
    await this.deletion.restoreProfessional(id, adminAccountId, this.clientIp(req));
  }

  @ApiOperation({
    summary: 'Eliminar (logico) un comercio y sus membresias; bloquea su cuenta comercial',
  })
  @ApiResponse({ status: 204, description: 'Eliminado' })
  @ApiResponse({ status: 403, description: 'Solo admin' })
  @ApiResponse({ status: 404, description: 'Comercio no encontrado' })
  @Delete('comercios/:id')
  @HttpCode(204)
  async deleteComercio(
    @Param('id') id: string,
    @CurrentAccount('sub') adminAccountId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<void> {
    await this.deletion.deleteComercio(id, adminAccountId, this.clientIp(req));
  }

  @ApiOperation({ summary: 'Restaurar un comercio eliminado (y reactivar su cuenta)' })
  @ApiResponse({ status: 204, description: 'Restaurado' })
  @ApiResponse({ status: 403, description: 'Solo admin' })
  @ApiResponse({ status: 404, description: 'Comercio no encontrado' })
  @Post('comercios/:id/restore')
  @HttpCode(204)
  async restoreComercio(
    @Param('id') id: string,
    @CurrentAccount('sub') adminAccountId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<void> {
    await this.deletion.restoreComercio(id, adminAccountId, this.clientIp(req));
  }

  @ApiOperation({
    summary: 'Eliminar (logico) un cliente (vinculo professional_client)',
    description:
      'Soft-borra el vinculo cliente-profesional. Si a la persona no le queda ningun ' +
      'otro vinculo activo, tambien se borra la persona global y se bloquea su cuenta.',
  })
  @ApiResponse({ status: 204, description: 'Eliminado' })
  @ApiResponse({ status: 403, description: 'Solo admin' })
  @ApiResponse({ status: 404, description: 'Cliente no encontrado' })
  @Delete('clients/:id')
  @HttpCode(204)
  async deleteClient(
    @Param('id') id: string,
    @CurrentAccount('sub') adminAccountId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<void> {
    await this.deletion.deleteClient(id, adminAccountId, this.clientIp(req));
  }

  @ApiOperation({ summary: 'Restaurar un cliente eliminado (y la persona si aplica)' })
  @ApiResponse({ status: 204, description: 'Restaurado' })
  @ApiResponse({ status: 403, description: 'Solo admin' })
  @ApiResponse({ status: 404, description: 'Cliente no encontrado' })
  @Post('clients/:id/restore')
  @HttpCode(204)
  async restoreClient(
    @Param('id') id: string,
    @CurrentAccount('sub') adminAccountId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<void> {
    await this.deletion.restoreClient(id, adminAccountId, this.clientIp(req));
  }
}
