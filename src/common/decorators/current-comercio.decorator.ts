import {
  createParamDecorator,
  ExecutionContext,
  InternalServerErrorException,
} from '@nestjs/common';
import { AuthenticatedRequest } from '@/common/types/request-user';

/** Inyecta el comercio_id resuelto por ComercioMembershipGuard/ComercioOwnerGuard. */
export const CurrentComercio = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.comercioId) {
      throw new InternalServerErrorException('Comercio no resuelto en la request');
    }
    return request.comercioId;
  },
);

/** Inyecta el membership_id resuelto por ComercioMembershipGuard (worker en comercio). */
export const CurrentMembership = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.membershipId) {
      throw new InternalServerErrorException('Membresía no resuelta en la request');
    }
    return request.membershipId;
  },
);

/**
 * Igual que CurrentMembership pero devuelve `undefined` si no hay membresía (caso
 * comercial puro bajo ComercioAccessGuard). El handler decide si es obligatoria.
 */
export const OptionalMembership = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | undefined => {
    return ctx.switchToHttp().getRequest<AuthenticatedRequest>().membershipId;
  },
);
