import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppRole } from '@/common/enums';
import { ROLES_KEY } from '@/common/decorators/roles.decorator';
import { AuthenticatedRequest } from '@/common/types/request-user';

/**
 * Verifica que el usuario tenga al menos uno de los roles requeridos.
 * El platform admin pasa siempre.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<AppRole[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;
    if (!user) throw new ForbiddenException('No autenticado');
    if (user.isPlatformAdmin) return true;

    const ok = user.roles?.some((r) => required.includes(r));
    if (!ok) {
      throw new ForbiddenException('No tenes permisos para esta accion');
    }
    return true;
  }
}
