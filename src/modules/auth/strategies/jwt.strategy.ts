import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '@/redis/redis.module';
import { BLOCKED_ACCOUNT_PREFIX } from '../blocked-account';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { JwtConfig } from '@/config/configuration';
import { JwtPayload, RequestUser } from '@/common/types/request-user';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {
    const jwt = config.getOrThrow<JwtConfig>('jwt');
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: jwt.accessSecret,
    });
  }

  /** El valor devuelto se adjunta como request.user. */
  async validate(payload: JwtPayload): Promise<RequestUser> {
    // Cuenta bloqueada por un admin: el access token deja de valer YA (no al vencer).
    // Si Redis no responde se deja pasar (fail-open): el bloqueo igual corta en el refresh.
    const blocked = await this.redis
      .exists(`${BLOCKED_ACCOUNT_PREFIX}${payload.sub}`)
      .catch(() => 0);
    if (blocked) throw new UnauthorizedException('Cuenta bloqueada');
    return payload;
  }
}
