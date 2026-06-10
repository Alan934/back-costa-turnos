import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { TenantGuard } from '@/common/guards/tenant.guard';
import { SubscriptionGuard } from '@/common/guards/subscription.guard';
import { Roles } from '@/common/decorators/roles.decorator';
import { CurrentTenant } from '@/common/decorators/current-tenant.decorator';
import { AppRole } from '@/common/enums';
import { WaitlistService } from './waitlist.service';
import { WaitlistEntry } from './entities/waitlist-entry.entity';
import { CreateWaitlistDto } from './dto/waitlist.dto';

@ApiTags('waitlist')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard, SubscriptionGuard)
@Roles(AppRole.Professional, AppRole.Staff)
@Controller('waitlist')
export class WaitlistController {
  constructor(private readonly waitlist: WaitlistService) {}

  @ApiOperation({ summary: 'Listar entradas de lista de espera' })
  @ApiResponse({ status: 200, type: WaitlistEntry, isArray: true })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  @Get()
  list(@CurrentTenant() tenantId: string) {
    return this.waitlist.list(tenantId);
  }

  @ApiOperation({ summary: 'Crear entrada en lista de espera' })
  @ApiResponse({ status: 201, type: WaitlistEntry })
  @ApiResponse({ status: 400, description: 'Datos invalidos' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  @Post()
  create(@CurrentTenant() tenantId: string, @Body() dto: CreateWaitlistDto) {
    return this.waitlist.create(tenantId, dto);
  }

  @ApiOperation({ summary: 'Notificar hueco disponible a la entrada' })
  @ApiResponse({ status: 201, type: WaitlistEntry })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  @ApiResponse({ status: 404, description: 'No encontrado' })
  @Post(':id/notify')
  notify(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.waitlist.notify(tenantId, id);
  }

  @ApiOperation({ summary: 'Convertir entrada de lista de espera' })
  @ApiResponse({ status: 201, type: WaitlistEntry })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  @ApiResponse({ status: 404, description: 'No encontrado' })
  @Post(':id/convert')
  convert(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.waitlist.convert(tenantId, id);
  }

  @ApiOperation({ summary: 'Eliminar entrada de lista de espera' })
  @ApiResponse({ status: 204, description: 'Entrada eliminada' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  @ApiResponse({ status: 404, description: 'No encontrado' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':id')
  remove(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.waitlist.remove(tenantId, id);
  }
}
