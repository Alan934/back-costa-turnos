import { Request } from 'express';
import { AppRole } from '@/common/enums';

/** Payload firmado en el JWT de acceso. */
export interface JwtPayload {
  /** account.id */
  sub: string;
  email: string;
  roles: AppRole[];
  isPlatformAdmin: boolean;
  /** tenant que administra (professional/staff). */
  professionalId?: string;
  staffId?: string;
}

/** Usuario autenticado adjuntado a la request por la estrategia JWT. */
export type RequestUser = JwtPayload;

export interface AuthenticatedRequest extends Request {
  user?: RequestUser;
  /** tenant resuelto por el TenantGuard (token o slug publico). */
  tenantId?: string;
}
