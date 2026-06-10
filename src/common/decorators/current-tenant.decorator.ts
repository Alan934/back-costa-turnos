import {
  createParamDecorator,
  ExecutionContext,
  InternalServerErrorException,
} from '@nestjs/common';
import { AuthenticatedRequest } from '@/common/types/request-user';

/**
 * Inyecta el professional_id (tenant) resuelto por el TenantGuard.
 * Lanza si no hay tenant: usar solo en rutas protegidas por TenantGuard.
 */
export const CurrentTenant = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.tenantId) {
      throw new InternalServerErrorException('Tenant no resuelto en la request');
    }
    return request.tenantId;
  },
);
