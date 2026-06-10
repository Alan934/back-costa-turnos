import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { AuthenticatedRequest } from '@/common/types/request-user';

/**
 * Resuelve el tenant (professional_id) de la request y lo deja en request.tenantId.
 *
 * - professional/staff: viene en el token.
 * - platform admin: puede actuar sobre cualquier tenant via header `x-professional-id`.
 *
 * Las rutas publicas de reserva (/r/:slug) NO usan este guard: resuelven el
 * professional por slug en su propio controlador.
 */
@Injectable()
export class TenantGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;
    if (!user) throw new ForbiddenException('No autenticado');

    let tenantId = user.professionalId;

    if (user.isPlatformAdmin) {
      const header = request.headers['x-professional-id'];
      const fromHeader = Array.isArray(header) ? header[0] : header;
      tenantId = fromHeader ?? tenantId;
    }

    if (!tenantId) {
      throw new ForbiddenException('No hay un tenant asociado a esta cuenta');
    }

    request.tenantId = tenantId;
    return true;
  }
}
