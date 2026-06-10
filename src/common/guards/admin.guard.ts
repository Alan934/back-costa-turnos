import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { AuthenticatedRequest } from '@/common/types/request-user';

/**
 * Solo permite a la cuenta platform admin (el dueño de la plataforma).
 */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;
    if (!user) throw new ForbiddenException('No autenticado');
    if (!user.isPlatformAdmin) {
      throw new ForbiddenException('Solo el administrador de la plataforma puede hacer esto');
    }
    return true;
  }
}
