import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { TenantGuard } from '@/common/guards/tenant.guard';
import { Roles } from '@/common/decorators/roles.decorator';
import { CurrentAccount } from '@/common/decorators/current-account.decorator';
import { CurrentTenant } from '@/common/decorators/current-tenant.decorator';
import { AppRole } from '@/common/enums';
import { ProfessionalsService } from './professionals.service';
import { Professional } from './entities/professional.entity';
import { Staff } from './entities/staff.entity';
import {
  CreateStaffDto,
  OnboardProfessionalDto,
  UpdateProfessionalDto,
  UpdateStaffDto,
} from './dto/professional.dto';

@ApiTags('professionals')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('professionals')
export class ProfessionalsController {
  constructor(private readonly professionals: ProfessionalsService) {}

  /** Onboarding del tenant para la cuenta autenticada. */
  @ApiOperation({ summary: 'Onboarding del professional (tenant)' })
  @ApiResponse({ status: 201, type: Professional })
  @ApiResponse({ status: 400, description: 'Datos invalidos' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @Post('onboard')
  onboard(@CurrentAccount('sub') accountId: string, @Body() dto: OnboardProfessionalDto) {
    return this.professionals.onboard(accountId, dto);
  }

  @ApiOperation({ summary: 'Obtener el professional propio' })
  @ApiResponse({ status: 200, type: Professional })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  @UseGuards(RolesGuard, TenantGuard)
  @Roles(AppRole.Professional)
  @Get('me')
  getMine(@CurrentTenant() tenantId: string) {
    return this.professionals.findById(tenantId);
  }

  @ApiOperation({ summary: 'Actualizar el professional propio' })
  @ApiResponse({ status: 200, type: Professional })
  @ApiResponse({ status: 400, description: 'Datos invalidos' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  @UseGuards(RolesGuard, TenantGuard)
  @Roles(AppRole.Professional)
  @Patch('me')
  updateMine(@CurrentTenant() tenantId: string, @Body() dto: UpdateProfessionalDto) {
    return this.professionals.update(tenantId, dto);
  }

  // ---- Staff ----
  @ApiOperation({ summary: 'Listar el staff del professional' })
  @ApiResponse({ status: 200, type: Staff, isArray: true })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  @UseGuards(RolesGuard, TenantGuard)
  @Roles(AppRole.Professional)
  @Get('staff')
  listStaff(@CurrentTenant() tenantId: string) {
    return this.professionals.listStaff(tenantId);
  }

  @ApiOperation({ summary: 'Crear un staff' })
  @ApiResponse({ status: 201, type: Staff })
  @ApiResponse({ status: 400, description: 'Datos invalidos' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  @UseGuards(RolesGuard, TenantGuard)
  @Roles(AppRole.Professional)
  @Post('staff')
  createStaff(@CurrentTenant() tenantId: string, @Body() dto: CreateStaffDto) {
    return this.professionals.createStaff(tenantId, dto);
  }

  @ApiOperation({ summary: 'Actualizar un staff' })
  @ApiResponse({ status: 200, type: Staff })
  @ApiResponse({ status: 400, description: 'Datos invalidos' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  @ApiResponse({ status: 404, description: 'No encontrado' })
  @UseGuards(RolesGuard, TenantGuard)
  @Roles(AppRole.Professional)
  @Patch('staff/:id')
  updateStaff(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateStaffDto,
  ) {
    return this.professionals.updateStaff(tenantId, id, dto);
  }

  @ApiOperation({ summary: 'Desactivar un staff' })
  @ApiResponse({ status: 204, description: 'Staff desactivado' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  @ApiResponse({ status: 404, description: 'No encontrado' })
  @UseGuards(RolesGuard, TenantGuard)
  @Roles(AppRole.Professional)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete('staff/:id')
  deactivateStaff(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.professionals.deactivateStaff(tenantId, id);
  }
}
