import { Request } from 'express';
import { AppRole } from '@/common/enums';

/** Payload firmado en el JWT de acceso. */
export interface JwtPayload {
  /** account.id */
  sub: string;
  email: string;
  /** true si la cuenta verificó su email (account.email_verified_at != null). */
  emailVerified: boolean;
  roles: AppRole[];
  isPlatformAdmin: boolean;
  /** professional (trabajador) dueño de clientes/suscripción. */
  professionalId?: string;
  staffId?: string;
  /** comercios que ADMINISTRA como comercial (es dueño). */
  comercioIds?: string[];
}

/** Usuario autenticado adjuntado a la request por la estrategia JWT. */
export type RequestUser = JwtPayload;

export interface AuthenticatedRequest extends Request {
  user?: RequestUser;
  /** tenant (worker) resuelto por el TenantGuard. */
  tenantId?: string;
  /** comercio resuelto por ComercioMembershipGuard/ComercioOwnerGuard. */
  comercioId?: string;
  /** membresía del worker en el comercio (ComercioMembershipGuard). */
  membershipId?: string;
}
