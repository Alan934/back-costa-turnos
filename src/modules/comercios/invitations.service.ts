import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomBytes } from 'node:crypto';
import { InvitationStatus } from '@/common/enums';
import { MailerService } from '@/modules/mailer/mailer.service';
import { ComercioInvitation } from './entities/comercio-invitation.entity';
import { Membership } from './entities/membership.entity';
import { ComerciosService } from './comercios.service';

const INVITATION_TTL_DAYS = 7;

@Injectable()
export class InvitationsService {
  constructor(
    @InjectRepository(ComercioInvitation)
    private readonly invitations: Repository<ComercioInvitation>,
    private readonly comercios: ComerciosService,
    private readonly mailer: MailerService,
  ) {}

  /** El comercio invita a un profesional por email. */
  async invite(comercioId: string, email: string): Promise<ComercioInvitation> {
    const comercio = await this.comercios.getComercio(comercioId);

    // El profesional debe existir (cuenta de profesional con ese email).
    const professional = await this.comercios.findProfessionalByEmail(email);
    if (!professional) {
      throw new NotFoundException('No existe un profesional con ese email');
    }

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
   * membresía en ese comercio. Requiere que la cuenta sea profesional (worker).
   */
  async accept(accountId: string, token: string): Promise<Membership> {
    const invitation = await this.invitations
      .createQueryBuilder('i')
      .addSelect('i.token')
      .where('i.token = :token', { token })
      .getOne();

    if (!invitation || invitation.status !== InvitationStatus.Pending) {
      throw new BadRequestException('Invitación inválida o ya utilizada');
    }
    if (invitation.expiresAt.getTime() < Date.now()) {
      invitation.status = InvitationStatus.Expired;
      await this.invitations.save(invitation);
      throw new BadRequestException('La invitación venció');
    }

    const professional = await this.comercios.findProfessionalByAccount(accountId);
    if (!professional) {
      throw new BadRequestException(
        'Para aceptar la invitación necesitás una cuenta de profesional. Registrate como profesional primero.',
      );
    }

    const membership = await this.comercios.addMembership(professional.id, invitation.comercioId);

    invitation.status = InvitationStatus.Accepted;
    invitation.acceptedAt = new Date();
    await this.invitations.save(invitation);

    return membership;
  }
}
