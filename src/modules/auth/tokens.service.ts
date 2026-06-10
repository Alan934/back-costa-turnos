import { Injectable } from '@nestjs/common';
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
        { sub: payload.sub },
        {
          secret: this.jwtConfig.refreshSecret,
          expiresIn: this.jwtConfig.refreshTtl as unknown as number,
        },
      ),
    ]);
    return { accessToken, refreshToken };
  }

  verifyRefresh(token: string): Promise<{ sub: string }> {
    return this.jwt.verifyAsync(token, { secret: this.jwtConfig.refreshSecret });
  }
}
