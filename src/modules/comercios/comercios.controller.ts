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
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ComercioOwnerGuard } from '@/common/guards/comercio-owner.guard';
import { ComercioMembershipGuard } from '@/common/guards/comercio-membership.guard';
import { Public } from '@/common/decorators/public.decorator';
import { CurrentAccount } from '@/common/decorators/current-account.decorator';
import { CurrentComercio, CurrentMembership } from '@/common/decorators/current-comercio.decorator';
import { ComerciosService } from './comercios.service';
import { InvitationsService } from './invitations.service';
import { Comercio } from './entities/comercio.entity';
import { Membership } from './entities/membership.entity';
import { ComercioInvitation } from './entities/comercio-invitation.entity';
import {
  AcceptInvitationDto,
  InvitationPreviewDto,
  InviteProfessionalDto,
  UpdateComercioDto,
  UpdateMembershipDto,
} from './dto/comercio.dto';

@ApiTags('comercios')
@ApiBearerAuth()
@Controller('comercios')
export class ComerciosController {
  constructor(
    private readonly comercios: ComerciosService,
    private readonly invitations: InvitationsService,
  ) {}

  // ---- Scope profesional (worker) ----
  @ApiOperation({ summary: 'Comercios donde trabajo (mis membresías)' })
  @ApiResponse({ status: 200, type: Membership, isArray: true })
  @Get('memberships/mine')
  myMemberships(@CurrentAccount('professionalId') professionalId: string | undefined) {
    if (!professionalId) return [];
    return this.comercios.listMyMemberships(professionalId);
  }

  @ApiOperation({
    summary: 'Preview público de una invitación (landing)',
    description:
      'Sin auth. Devuelve lo necesario para que la landing decida registrarse vs ingresar. ' +
      'Token inexistente → 404; cancelado o vencido → 410.',
  })
  @ApiResponse({ status: 200, type: InvitationPreviewDto })
  @ApiResponse({ status: 404, description: 'Invitación no encontrada' })
  @ApiResponse({ status: 410, description: 'Invitación cancelada o vencida' })
  @Public()
  @Get('invitations/preview')
  previewInvitation(@Query('token') token: string) {
    return this.invitations.preview(token);
  }

  @ApiOperation({ summary: 'Aceptar una invitación a un comercio' })
  @ApiResponse({ status: 201, type: Membership })
  @ApiResponse({ status: 400, description: 'Invitación inválida/vencida o no sos profesional' })
  @ApiResponse({ status: 409, description: 'El email de la cuenta no coincide con el invitado' })
  @Post('invitations/accept')
  accept(
    @CurrentAccount('sub') accountId: string,
    @CurrentAccount('email') email: string,
    @Body() dto: AcceptInvitationDto,
  ) {
    return this.invitations.accept(accountId, email, dto.token);
  }

  @ApiOperation({
    summary: 'Editar mi membresía en un comercio (p.ej. mi dirección propia)',
    description: 'El profesional edita su propia membresía en el comercio donde es miembro activo.',
  })
  @ApiResponse({ status: 200, type: Membership })
  @ApiResponse({ status: 403, description: 'No tenés membresía activa en este comercio' })
  @ApiParam({ name: 'comercioId', format: 'uuid' })
  @UseGuards(ComercioMembershipGuard)
  @Patch(':comercioId/membership')
  updateMyMembership(@CurrentMembership() membershipId: string, @Body() dto: UpdateMembershipDto) {
    return this.comercios.updateMembership(membershipId, dto);
  }

  // ---- Scope comercial (dueño del comercio) ----
  @ApiOperation({ summary: 'Comercios que administro' })
  @ApiResponse({ status: 200, type: Comercio, isArray: true })
  @Get('mine')
  myComercios(@CurrentAccount('sub') accountId: string) {
    return this.comercios.getOwnedComercios(accountId);
  }

  @ApiOperation({ summary: 'Obtener un comercio' })
  @ApiResponse({ status: 200, type: Comercio })
  @ApiResponse({ status: 403, description: 'No administrás este comercio' })
  @ApiParam({ name: 'comercioId', format: 'uuid' })
  @UseGuards(ComercioOwnerGuard)
  @Get(':comercioId')
  get(@CurrentComercio() comercioId: string) {
    return this.comercios.getComercio(comercioId);
  }

  @ApiOperation({ summary: 'Actualizar un comercio' })
  @ApiResponse({ status: 200, type: Comercio })
  @ApiResponse({ status: 403, description: 'No administrás este comercio' })
  @ApiParam({ name: 'comercioId', format: 'uuid' })
  @UseGuards(ComercioOwnerGuard)
  @Patch(':comercioId')
  update(@CurrentComercio() comercioId: string, @Body() dto: UpdateComercioDto) {
    return this.comercios.updateComercio(comercioId, dto);
  }

  @ApiOperation({ summary: 'Roster del comercio (profesionales)' })
  @ApiResponse({ status: 200, type: Membership, isArray: true })
  @ApiResponse({ status: 403, description: 'No administrás este comercio' })
  @ApiParam({ name: 'comercioId', format: 'uuid' })
  @UseGuards(ComercioOwnerGuard)
  @Get(':comercioId/members')
  members(@CurrentComercio() comercioId: string) {
    return this.comercios.listMembers(comercioId);
  }

  @ApiOperation({
    summary: 'Quitar un profesional del comercio',
    description:
      'Soft: marca la membresía inactiva y la desasigna de todos los servicios. Conserva los ' +
      'turnos ya tomados; no permite nuevas reservas con ese profesional.',
  })
  @ApiResponse({ status: 200, type: Membership })
  @ApiResponse({ status: 403, description: 'No administrás este comercio' })
  @ApiResponse({ status: 404, description: 'Profesional no encontrado en este comercio' })
  @ApiParam({ name: 'comercioId', format: 'uuid' })
  @UseGuards(ComercioOwnerGuard)
  @Delete(':comercioId/members/:membershipId')
  removeMember(@CurrentComercio() comercioId: string, @Param('membershipId') membershipId: string) {
    return this.comercios.deactivateMembership(comercioId, membershipId);
  }

  @ApiOperation({
    summary: 'Invitar un profesional por email',
    description:
      'El email no necesita tener cuenta de profesional al invitar: la invitación queda pendiente ' +
      'y se valida que sea profesional al aceptarla.',
  })
  @ApiResponse({ status: 201, type: ComercioInvitation })
  @ApiResponse({ status: 403, description: 'No administrás este comercio' })
  @ApiParam({ name: 'comercioId', format: 'uuid' })
  @UseGuards(ComercioOwnerGuard)
  @Post(':comercioId/invitations')
  invite(@CurrentComercio() comercioId: string, @Body() dto: InviteProfessionalDto) {
    return this.invitations.invite(comercioId, dto.email);
  }

  @ApiOperation({ summary: 'Listar invitaciones del comercio' })
  @ApiResponse({ status: 200, type: ComercioInvitation, isArray: true })
  @ApiResponse({ status: 403, description: 'No administrás este comercio' })
  @ApiParam({ name: 'comercioId', format: 'uuid' })
  @UseGuards(ComercioOwnerGuard)
  @Get(':comercioId/invitations')
  listInvitations(@CurrentComercio() comercioId: string) {
    return this.invitations.listForComercio(comercioId);
  }

  @ApiOperation({ summary: 'Cancelar una invitación' })
  @ApiResponse({ status: 204, description: 'Invitación cancelada' })
  @ApiResponse({ status: 403, description: 'No administrás este comercio' })
  @ApiParam({ name: 'comercioId', format: 'uuid' })
  @UseGuards(ComercioOwnerGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':comercioId/invitations/:id')
  cancelInvitation(@CurrentComercio() comercioId: string, @Param('id') id: string) {
    return this.invitations.cancel(comercioId, id);
  }
}
