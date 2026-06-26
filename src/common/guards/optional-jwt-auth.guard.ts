import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RequestUser } from '@/common/types/request-user';

/**
 * Guard JWT OPCIONAL para rutas públicas que se comportan distinto cuando el
 * cliente está logueado (p. ej. la reserva pública: si hay sesión, el turno se
 * ata a la cuenta). Si hay un bearer válido adjunta request.user; si falta el
 * token o es inválido/vencido, deja pasar igual con request.user = undefined.
 *
 * A diferencia de JwtAuthGuard, NUNCA devuelve 401.
 */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  // Passport llama esto con el resultado de la estrategia. Por defecto lanzaría
  // 401 si falta el usuario; acá tragamos el error/ausencia y devolvemos
  // undefined para que la ruta siga siendo anónima.
  handleRequest<TUser = RequestUser>(_err: unknown, user: TUser | false): TUser | undefined {
    return user || undefined;
  }
}
