import { Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { JwtConfig } from '@/config/configuration';
import { JwtPayload } from '@/common/types/request-user';

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
}

/**
 * Firma y verifica los JWT de acceso y refresh.
 */
@Injectable()
export class TokensService {
  private readonly jwtConfig: JwtConfig;

  constructor(
    private readonly jwt: JwtService,
    config: ConfigService,
  ) {
    this.jwtConfig = config.getOrThrow<JwtConfig>('jwt');
  }

  async issueTokens(payload: JwtPayload): Promise<IssuedTokens> {
    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(
        { ...payload },
        {
          secret: this.jwtConfig.accessSecret,
          expiresIn: this.jwtConfig.accessTtl as unknown as number,
        },
      ),
      this.jwt.signAsync(
        // jti aleatorio: dos refresh emitidos en el mismo segundo nunca son idénticos.
        { sub: payload.sub, sid: payload.sid, jti: randomBytes(8).toString('hex') },
        {
          secret: this.jwtConfig.refreshSecret,
          expiresIn: this.jwtConfig.refreshTtl as unknown as number,
        },
      ),
    ]);
    return { accessToken, refreshToken };
  }

  /** Fecha de expiración (exp) de un JWT ya firmado. */
  expiryOf(token: string): Date {
    const decoded = this.jwt.decode<{ exp?: number }>(token);
    return new Date((decoded?.exp ?? 0) * 1000);
  }

  verifyRefresh(token: string): Promise<{ sub: string; sid?: string }> {
    return this.jwt.verifyAsync(token, { secret: this.jwtConfig.refreshSecret });
  }
}
