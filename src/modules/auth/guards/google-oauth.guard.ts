import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { Request, Response } from 'express';

/** Cookie httpOnly que ata el login de Google al navegador que lo inició (anti login-CSRF). */
export const GOOGLE_STATE_COOKIE = 'g_oauth_state';
const GOOGLE_STATE_PATH = '/auth/google';
const STATE_TTL_MS = 10 * 60_000;

function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    if (part.slice(0, idx).trim() === name) return decodeURIComponent(part.slice(idx + 1).trim());
  }
  return undefined;
}

/** Compara `state` (query) contra la cookie en tiempo constante. */
export function isValidGoogleState(req: Request): boolean {
  const fromQuery = typeof req.query?.state === 'string' ? req.query.state : '';
  const fromCookie = readCookie(req, GOOGLE_STATE_COOKIE) ?? '';
  if (!fromQuery || !fromCookie) return false;
  const a = Buffer.from(fromQuery);
  const b = Buffer.from(fromCookie);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function clearGoogleStateCookie(res: Response): void {
  res.clearCookie(GOOGLE_STATE_COOKIE, { path: GOOGLE_STATE_PATH });
}

/**
 * Guard de Google OAuth.
 *  - Al iniciar (/auth/google): genera un `state` aleatorio, lo guarda en una cookie
 *    httpOnly y lo manda a Google.
 *  - En el callback: NO lanza si Google devuelve error/cancelación (el controller redirige
 *    al front con un error legible) y deja el perfil en `req.user` si salió bien. La
 *    verificación del `state` la hace el controller antes de emitir tokens.
 */
@Injectable()
export class GoogleOAuthGuard extends AuthGuard('google') {
  getAuthenticateOptions(context: ExecutionContext): { state?: string } {
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    if (req.path.endsWith('/callback')) return {};

    const state = randomBytes(24).toString('base64url');
    http.getResponse<Response>().cookie(GOOGLE_STATE_COOKIE, state, {
      httpOnly: true,
      sameSite: 'lax', // el callback es una navegación top-level GET: la cookie viaja
      secure: process.env.NODE_ENV === 'production',
      maxAge: STATE_TTL_MS,
      path: GOOGLE_STATE_PATH,
    });
    return { state };
  }

  handleRequest<TUser>(err: unknown, user: TUser): TUser {
    // Sin excepción: user falsy => el controller redirige con error.
    return (err ? null : user) as TUser;
  }
}
