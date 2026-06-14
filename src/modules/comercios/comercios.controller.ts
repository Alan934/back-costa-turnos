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
import { ComercioOwnerGuard } from '@/common/guards/comercio-owner.guard';
import { ComercioMembershipGuard } from '@/common/guards/comercio-membership.guard';
import { CurrentAccount } from '@/common/decorators/current-account.decorator';
import { CurrentComercio, CurrentMembership } from '@/common/decorators/current-comercio.decorator';
import { ComerciosService } from './comercios.service';
import { InvitationsService } from './invitations.service';
import { Comercio } from './entities/comercio.entity';
import { Membership } from './entities/membership.entity';
import { ComercioInvitation } from './entities/comercio-invitation.entity';
import {
  AcceptInvitationDto,
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

  @ApiOperation({ summary: 'Aceptar una invitación a un comercio' })
  @ApiResponse({ status: 201, type: Membership })
  @ApiResponse({ status: 400, description: 'Invitación inválida/vencida o no sos profesional' })
  @Post('invitations/accept')
  accept(@CurrentAccount('sub') accountId: string, @Body() dto: AcceptInvitationDto) {
    return this.invitations.accept(accountId, dto.token);
  }

  @ApiOperation({
    summary: 'Editar mi membresía en un comercio (p.ej. mi dirección propia)',
    description: 'El profesional edita su propia membresía en el comercio donde es miembro activo.',
  })
  @ApiResponse({ status: 200, type: Membership })
  @ApiResponse({ status: 403, description: 'No tenés membresía activa en este comercio' })
  @UseGuards(ComercioMembershipGuard)
  @Patch(':comercioId/membership')
  updateMyMembership(
    @CurrentMembership() membershipId: string,
    @Body() dto: UpdateMembershipDto,
  ) {
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
  @UseGuards(ComercioOwnerGuard)
  @Get(':comercioId')
  get(@CurrentComercio() comercioId: string) {
    return this.comercios.getComercio(comercioId);
  }

  @ApiOperation({ summary: 'Actualizar un comercio' })
  @ApiResponse({ status: 200, type: Comercio })
  @ApiResponse({ status: 403, description: 'No administrás este comercio' })
  @UseGuards(ComercioOwnerGuard)
  @Patch(':comercioId')
  update(@CurrentComercio() comercioId: string, @Body() dto: UpdateComercioDto) {
    return this.comercios.updateComercio(comercioId, dto);
  }

  @ApiOperation({ summary: 'Roster del comercio (profesionales)' })
  @ApiResponse({ status: 200, type: Membership, isArray: true })
  @ApiResponse({ status: 403, description: 'No administrás este comercio' })
  @UseGuards(ComercioOwnerGuard)
  @Get(':comercioId/members')
  members(@CurrentComercio() comercioId: string) {
    return this.comercios.listMembers(comercioId);
  }

  @ApiOperation({ summary: 'Invitar un profesional por email' })
  @ApiResponse({ status: 201, type: ComercioInvitation })
  @ApiResponse({ status: 403, description: 'No administrás este comercio' })
  @ApiResponse({ status: 404, description: 'No existe un profesional con ese email' })
  @UseGuards(ComercioOwnerGuard)
  @Post(':comercioId/invitations')
  invite(@CurrentComercio() comercioId: string, @Body() dto: InviteProfessionalDto) {
    return this.invitations.invite(comercioId, dto.email);
  }

  @ApiOperation({ summary: 'Listar invitaciones del comercio' })
  @ApiResponse({ status: 200, type: ComercioInvitation, isArray: true })
  @ApiResponse({ status: 403, description: 'No administrás este comercio' })
  @UseGuards(ComercioOwnerGuard)
  @Get(':comercioId/invitations')
  listInvitations(@CurrentComercio() comercioId: string) {
    return this.invitations.listForComercio(comercioId);
  }

  @ApiOperation({ summary: 'Cancelar una invitación' })
  @ApiResponse({ status: 204, description: 'Invitación cancelada' })
  @ApiResponse({ status: 403, description: 'No administrás este comercio' })
  @UseGuards(ComercioOwnerGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':comercioId/invitations/:id')
  cancelInvitation(@CurrentComercio() comercioId: string, @Param('id') id: string) {
    return this.invitations.cancel(comercioId, id);
  }
}
