import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { TenantGuard } from '@/common/guards/tenant.guard';
import { Roles } from '@/common/decorators/roles.decorator';
import { CurrentAccount } from '@/common/decorators/current-account.decorator';
import { CurrentTenant } from '@/common/decorators/current-tenant.decorator';
import { AppRole } from '@/common/enums';
import { AuthenticatedRequest } from '@/common/types/request-user';
import { LegalService } from './legal.service';
import { Consent } from './entities/consent.entity';
import { AuditLog } from './entities/audit-log.entity';
import { RecordConsentDto } from './dto/consent.dto';

@ApiTags('legal')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class LegalController {
  constructor(private readonly legal: LegalService) {}

  @ApiOperation({ summary: 'Registrar consentimiento' })
  @ApiResponse({ status: 201, type: Consent })
  @ApiResponse({ status: 400, description: 'Datos invalidos' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @Post('consent')
  recordConsent(
    @CurrentAccount('sub') accountId: string,
    @Body() dto: RecordConsentDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.legal.recordConsent(accountId, dto.type, dto.version, req.ip ?? null);
  }

  @ApiOperation({ summary: 'Listar mis consentimientos' })
  @ApiResponse({ status: 200, type: Consent, isArray: true })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @Get('consent/mine')
  myConsents(@CurrentAccount('sub') accountId: string) {
    return this.legal.listConsents(accountId);
  }

  @ApiOperation({ summary: 'Listar registros de auditoria' })
  @ApiResponse({ status: 200, type: AuditLog, isArray: true })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  @UseGuards(RolesGuard, TenantGuard)
  @Roles(AppRole.Professional)
  @Get('audit-log')
  audit(@CurrentTenant() tenantId: string) {
    return this.legal.listAudit(tenantId);
  }
}
