import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MembershipStatus } from '@/common/enums';
import { Comercio } from '@/modules/comercios/entities/comercio.entity';
import { Membership } from '@/modules/comercios/entities/membership.entity';
import { AuthenticatedRequest } from '@/common/types/request-user';
import { resolveComercioId } from './comercio-membership.guard';

/**
 * Acceso a recursos de un comercio para quien lo GESTIONA: el comercial dueño
 * (como ComercioOwnerGuard) o un profesional con membresía ACTIVA (como
 * ComercioMembershipGuard). El platform admin pasa siempre. Debe ir DESPUÉS de
 * JwtAuthGuard.
 *
 * Setea `request.comercioId` siempre y `request.membershipId` solo si el usuario
 * es miembro (profesional). Para el comercio-de-uno el profesional es a la vez
 * dueño y miembro, así que quedan ambos.
 */
@Injectable()
export class ComercioAccessGuard implements CanActivate {
  constructor(
    @InjectRepository(Comercio)
    private readonly comercios: Repository<Comercio>,
    @InjectRepository(Membership)
    private readonly memberships: Repository<Membership>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;
    if (!user) throw new ForbiddenException('No autenticado');

    const comercioId = resolveComercioId(request);
    if (!comercioId) {
      throw new BadRequestException('Falta el comercio (comercioId en la ruta o header)');
    }

    if (user.isPlatformAdmin) {
      request.comercioId = comercioId;
      return true;
    }

    const owner = await this.comercios.findOne({
      where: { id: comercioId, accountId: user.sub },
    });

    const membership = user.professionalId
      ? await this.memberships.findOne({
          where: {
            professionalId: user.professionalId,
            comercioId,
            status: MembershipStatus.Active,
          },
        })
      : null;

    if (!owner && !membership) {
      throw new ForbiddenException('No gestionás este comercio');
    }

    request.comercioId = comercioId;
    if (membership) request.membershipId = membership.id;
    return true;
  }
}
