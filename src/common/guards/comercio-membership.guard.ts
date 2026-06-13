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
import { Membership } from '@/modules/comercios/entities/membership.entity';
import { AuthenticatedRequest } from '@/common/types/request-user';

/**
 * Valida que el profesional (worker) tenga una membresía ACTIVA en el comercio
 * de la request (param `:comercioId` o header `x-comercio-id`) y deja
 * `request.comercioId` / `request.membershipId`. El platform admin pasa siempre.
 * Debe ir DESPUÉS de JwtAuthGuard.
 */
@Injectable()
export class ComercioMembershipGuard implements CanActivate {
  constructor(
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
    if (!user.professionalId) {
      throw new ForbiddenException('Tu cuenta no es de profesional');
    }

    const membership = await this.memberships.findOne({
      where: {
        professionalId: user.professionalId,
        comercioId,
        status: MembershipStatus.Active,
      },
    });
    if (!membership) {
      throw new ForbiddenException('No tenés una membresía activa en este comercio');
    }

    request.comercioId = comercioId;
    request.membershipId = membership.id;
    return true;
  }
}

export function resolveComercioId(request: AuthenticatedRequest): string | undefined {
  const fromParam = (request.params as Record<string, string> | undefined)?.comercioId;
  const header = request.headers['x-comercio-id'];
  const fromHeader = Array.isArray(header) ? header[0] : header;
  return fromParam ?? fromHeader;
}
