import {
  BadRequestException,
  ConflictException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomBytes } from 'node:crypto';
import { InvitationStatus } from '@/common/enums';
import { AccountsService } from '@/modules/identity/accounts.service';
import { MailerService } from '@/modules/mailer/mailer.service';
import { ComercioInvitation } from './entities/comercio-invitation.entity';
import { Membership } from './entities/membership.entity';
import { InvitationPreviewDto } from './dto/comercio.dto';
import { ComerciosService } from './comercios.service';

const INVITATION_TTL_DAYS = 7;

@Injectable()
export class InvitationsService {
  constructor(
    @InjectRepository(ComercioInvitation)
    private readonly invitations: Repository<ComercioInvitation>,
    private readonly comercios: ComerciosService,
    private readonly accounts: AccountsService,
    private readonly mailer: MailerService,
  ) {}

  /** Busca la invitación por token (incluye la columna `token`, que es `select: false`). */
  private findByToken(token: string): Promise<ComercioInvitation | null> {
    return this.invitations
      .createQueryBuilder('i')
      .addSelect('i.token')
      .where('i.token = :token', { token })
      .getOne();
  }

  /**
   * Preview público (sin auth) para la landing de invitación. Devuelve solo lo
   * necesario para decidir si el profesional debe registrarse o ingresar.
   * Token inexistente → 404; cancelado o vencido → 410.
   */
  async preview(token: string): Promise<InvitationPreviewDto> {
    const invitation = await this.findByToken(token);
    if (!invitation) throw new NotFoundException('Invitación no encontrada');
    if (invitation.status === InvitationStatus.Cancelled) {
      throw new GoneException('La invitación fue cancelada');
    }
    if (
      invitation.status === InvitationStatus.Expired ||
      (invitation.status === InvitationStatus.Pending &&
        invitation.expiresAt.getTime() < Date.now())
    ) {
      throw new GoneException('La invitación venció');
    }

    const comercio = await this.comercios.getComercio(invitation.comercioId);
    const account = await this.accounts.findByEmail(invitation.email);
    // "Existe cuenta" = se puede iniciar sesión (reclamada por password o por Google).
    // Una cuenta no reclamada (cargada por terceros) todavía debe registrarse.
    const accountExists = Boolean(account && (account.isClaimed || account.googleId));
    const isProfessional = account
      ? Boolean(await this.comercios.findProfessionalByAccount(account.id))
      : false;

    return {
      comercioName: comercio.name,
      email: invitation.email,
      status: invitation.status,
      expiresAt: invitation.expiresAt,
      accountExists,
      isProfessional,
    };
  }

  /**
   * El comercio invita a un profesional por email. No exige que el email ya tenga
   * cuenta de profesional: la invitación queda pendiente y se valida que sea
   * profesional al ACEPTARLA. Así el comercio puede invitar a alguien que todavía
   * no se registró (recibe el mail y, tras registrarse, la acepta).
   */
  async invite(comercioId: string, email: string): Promise<ComercioInvitation> {
    const comercio = await this.comercios.getComercio(comercioId);

    const token = randomBytes(24).toString('base64url');
    const invitation = await this.invitations.save(
      this.invitations.create({
        comercioId,
        email,
        token,
        status: InvitationStatus.Pending,
        expiresAt: new Date(Date.now() + INVITATION_TTL_DAYS * 86_400_000),
        acceptedAt: null,
      }),
    );

    await this.mailer.sendComercioInvitation(email, comercio.name, token);
    return invitation;
  }

  listForComercio(comercioId: string): Promise<ComercioInvitation[]> {
    return this.invitations.find({
      where: { comercioId },
      order: { createdAt: 'DESC' },
    });
  }

  async cancel(comercioId: string, id: string): Promise<void> {
    const invitation = await this.invitations.findOne({ where: { id, comercioId } });
    if (!invitation) throw new NotFoundException('Invitación no encontrada');
    if (invitation.status === InvitationStatus.Accepted) {
      throw new BadRequestException('La invitación ya fue aceptada');
    }
    invitation.status = InvitationStatus.Cancelled;
    await this.invitations.save(invitation);
  }

  /**
   * El profesional autenticado acepta una invitación con el token: crea su
   * membresía en ese comercio. Requiere que la cuenta sea profesional (worker) y
   * que su email coincida con el email invitado. Idempotente si ya fue aceptada.
   */
  async accept(accountId: string, accountEmail: string, token: string): Promise<Membership> {
    const invitation = await this.findByToken(token);
    if (!invitation) {
      throw new BadRequestException('Invitación inválida o ya utilizada');
    }
    if (invitation.status === InvitationStatus.Cancelled) {
      throw new BadRequestException('La invitación fue cancelada');
    }

    // La cuenta autenticada debe ser la del email invitado (citext: case-insensitive).
    if (invitation.email.toLowerCase() !== accountEmail.toLowerCase()) {
      throw new ConflictException(
        `Esta invitación es para ${invitation.email}. Iniciá sesión con esa cuenta para aceptarla.`,
      );
    }

    const professional = await this.comercios.findProfessionalByAccount(accountId);
    if (!professional) {
      throw new BadRequestException(
        'Para aceptar la invitación necesitás una cuenta de profesional. Registrate como profesional primero.',
      );
    }

    // Idempotente: si ya estaba aceptada, devolvé la membresía (addMembership la
    // reactiva o la encuentra) sin volver a fallar.
    if (invitation.status === InvitationStatus.Accepted) {
      return this.comercios.addMembership(professional.id, invitation.comercioId);
    }

    if (invitation.expiresAt.getTime() < Date.now()) {
      invitation.status = InvitationStatus.Expired;
      await this.invitations.save(invitation);
      throw new BadRequestException('La invitación venció');
    }

    const membership = await this.comercios.addMembership(professional.id, invitation.comercioId);

    invitation.status = InvitationStatus.Accepted;
    invitation.acceptedAt = new Date();
    await this.invitations.save(invitation);

    return membership;
  }
}
