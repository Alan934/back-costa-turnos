import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Comercio } from '@/modules/comercios/entities/comercio.entity';
import { AuthenticatedRequest } from '@/common/types/request-user';
import { resolveComercioId } from './comercio-membership.guard';

/**
 * Valida que la cuenta autenticada (comercial) sea DUEÑA del comercio de la
 * request. El platform admin pasa siempre. Debe ir DESPUÉS de JwtAuthGuard.
 */
@Injectable()
export class ComercioOwnerGuard implements CanActivate {
  constructor(
    @InjectRepository(Comercio)
    private readonly comercios: Repository<Comercio>,
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

    const comercio = await this.comercios.findOne({
      where: { id: comercioId, accountId: user.sub },
    });
    if (!comercio) {
      throw new ForbiddenException('No administrás este comercio');
    }
    request.comercioId = comercioId;
    return true;
  }
}
