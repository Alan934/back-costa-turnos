import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { SubscriptionsService } from '@/modules/subscriptions/subscriptions.service';
import { AuthenticatedRequest } from '@/common/types/request-user';

/** Metodos que no modifican estado: nunca se bloquean. */
const SAFE_METHODS = ['GET', 'HEAD', 'OPTIONS'];

/**
 * Bloquea las operaciones de ESCRITURA del tenant cuando su prueba/suscripcion
 * vencio (incluida la ventana de gracia). Las lecturas siempre pasan, y el
 * platform admin nunca se bloquea. Debe ir DESPUES del TenantGuard.
 */
@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(private readonly subscriptions: SubscriptionsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (SAFE_METHODS.includes(request.method)) return true;
    if (request.user?.isPlatformAdmin) return true;

    const tenantId = request.tenantId;
    if (!tenantId) return true;

    const sub = await this.subscriptions.getByTenant(tenantId).catch(() => null);
    if (!sub) return true; // sin suscripcion no bloqueamos (caso borde)

    if (!this.subscriptions.hasWriteAccess(sub)) {
      throw new ForbiddenException(
        'Tu periodo de prueba o suscripcion vencio. Aboná la suscripcion para seguir usando el sistema.',
      );
    }
    return true;
  }
}
