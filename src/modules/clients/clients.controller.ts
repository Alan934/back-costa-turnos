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
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { TenantGuard } from '@/common/guards/tenant.guard';
import { SubscriptionGuard } from '@/common/guards/subscription.guard';
import { Roles } from '@/common/decorators/roles.decorator';
import { CurrentTenant } from '@/common/decorators/current-tenant.decorator';
import { AppRole } from '@/common/enums';
import { ClientsService } from './clients.service';
import { ClientNote } from './entities/client-note.entity';
import { FichaField } from './entities/ficha-field.entity';
import { EnrichedClientDto } from './dto/enriched-client.dto';
import {
  CreateClientDto,
  CreateClientNoteDto,
  CreateFichaFieldDto,
  UpdateClientFichaDto,
  UpdateFichaFieldDto,
} from './dto/client.dto';

@ApiTags('clients')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard, SubscriptionGuard)
@Roles(AppRole.Professional, AppRole.Staff)
@Controller('clients')
export class ClientsController {
  constructor(private readonly clients: ClientsService) {}

  // ---- Ficha fields ----
  @ApiOperation({ summary: 'Listar campos de ficha' })
  @ApiResponse({ status: 200, type: FichaField, isArray: true })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  @Get('ficha-fields')
  listFichaFields(@CurrentTenant() tenantId: string) {
    return this.clients.listFichaFields(tenantId);
  }

  @ApiOperation({ summary: 'Crear un campo de ficha' })
  @ApiResponse({ status: 201, type: FichaField })
  @ApiResponse({ status: 400, description: 'Datos invalidos' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  @Post('ficha-fields')
  createFichaField(@CurrentTenant() tenantId: string, @Body() dto: CreateFichaFieldDto) {
    return this.clients.createFichaField(tenantId, dto);
  }

  @ApiOperation({ summary: 'Actualizar un campo de ficha' })
  @ApiResponse({ status: 200, type: FichaField })
  @ApiResponse({ status: 400, description: 'Datos invalidos' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  @ApiResponse({ status: 404, description: 'No encontrado' })
  @Patch('ficha-fields/:id')
  updateFichaField(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateFichaFieldDto,
  ) {
    return this.clients.updateFichaField(tenantId, id, dto);
  }

  @ApiOperation({ summary: 'Eliminar un campo de ficha' })
  @ApiResponse({ status: 204, description: 'Campo de ficha eliminado' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  @ApiResponse({ status: 404, description: 'No encontrado' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete('ficha-fields/:id')
  deleteFichaField(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.clients.deleteFichaField(tenantId, id);
  }

  // ---- Clients ----
  @ApiOperation({ summary: 'Listar clientes (con datos de la persona)' })
  @ApiResponse({ status: 200, type: EnrichedClientDto, isArray: true })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  @ApiQuery({ name: 'q', required: false, description: 'Busca por nombre, email o telefono' })
  @Get()
  listClients(@CurrentTenant() tenantId: string, @Query('q') q?: string) {
    return this.clients.listClients(tenantId, q);
  }

  @ApiOperation({ summary: 'Crear un cliente' })
  @ApiResponse({ status: 201, type: EnrichedClientDto })
  @ApiResponse({ status: 400, description: 'Datos invalidos' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  @Post()
  createClient(@CurrentTenant() tenantId: string, @Body() dto: CreateClientDto) {
    return this.clients.createClient(tenantId, dto);
  }

  @ApiOperation({ summary: 'Obtener un cliente por id (con datos de la persona)' })
  @ApiResponse({ status: 200, type: EnrichedClientDto })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  @ApiResponse({ status: 404, description: 'No encontrado' })
  @Get(':id')
  getClient(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.clients.getClientEnriched(tenantId, id);
  }

  @ApiOperation({ summary: 'Actualizar la ficha de un cliente' })
  @ApiResponse({ status: 200, type: EnrichedClientDto })
  @ApiResponse({ status: 400, description: 'Datos invalidos' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  @ApiResponse({ status: 404, description: 'No encontrado' })
  @Patch(':id/ficha')
  updateFicha(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateClientFichaDto,
  ) {
    return this.clients.updateClientFicha(tenantId, id, dto);
  }

  @ApiOperation({ summary: 'Archivar un cliente' })
  @ApiResponse({ status: 200, type: EnrichedClientDto })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  @ApiResponse({ status: 404, description: 'No encontrado' })
  @Delete(':id')
  archiveClient(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.clients.archiveClient(tenantId, id);
  }

  // ---- Notas privadas ----
  @ApiOperation({ summary: 'Listar notas privadas de un cliente' })
  @ApiResponse({ status: 200, type: ClientNote, isArray: true })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  @ApiResponse({ status: 404, description: 'No encontrado' })
  @Get(':id/notes')
  listNotes(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.clients.listNotes(tenantId, id);
  }

  @ApiOperation({ summary: 'Agregar una nota privada a un cliente' })
  @ApiResponse({ status: 201, type: ClientNote })
  @ApiResponse({ status: 400, description: 'Datos invalidos' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  @ApiResponse({ status: 404, description: 'No encontrado' })
  @Post(':id/notes')
  addNote(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: CreateClientNoteDto,
  ) {
    return this.clients.addNote(tenantId, id, dto);
  }
}
