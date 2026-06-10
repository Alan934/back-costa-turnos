import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { MercadoPagoConfig, OAuth } from 'mercadopago';
import { JwtConfig, MercadoPagoConfig as MpConfig } from '@/config/configuration';

export interface MpConnection {
  userId: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  publicKey: string | null;
  expiresAt: Date | null;
}

/**
 * Flujo OAuth de MercadoPago para que el profesional conecte SU cuenta
 * (marketplace). El `state` es un JWT corto que lleva el professionalId, para
 * reconciliar el callback (que es publico) con el tenant correcto.
 */
@Injectable()
export class MercadoPagoOAuthService {
  private readonly mp: MpConfig;
  private readonly stateSecret: string;

  constructor(
    config: ConfigService,
    private readonly jwt: JwtService,
  ) {
    this.mp = config.getOrThrow<MpConfig>('mercadopago');
    this.stateSecret = config.getOrThrow<JwtConfig>('jwt').accessSecret;
  }

  isConfigured(): boolean {
    return Boolean(this.mp.clientId && this.mp.clientSecret);
  }

  private oauth(): OAuth {
    // El access token de la plataforma no es necesario para getAuthorizationURL,
    // pero el SDK requiere un MercadoPagoConfig.
    return new OAuth(new MercadoPagoConfig({ accessToken: this.mp.accessToken || 'unused' }));
  }

  async buildConnectUrl(professionalId: string): Promise<string> {
    const state = await this.jwt.signAsync(
      { pid: professionalId, purpose: 'mp_connect' },
      { secret: this.stateSecret, expiresIn: '10m' },
    );
    return this.oauth().getAuthorizationURL({
      options: {
        client_id: this.mp.clientId,
        redirect_uri: this.mp.oauthRedirectUri,
        state,
      },
    });
  }

  async verifyState(state: string): Promise<string> {
    try {
      const payload = await this.jwt.verifyAsync<{ pid?: string; purpose?: string }>(state, {
        secret: this.stateSecret,
      });
      if (payload.purpose !== 'mp_connect' || !payload.pid) {
        throw new Error('state invalido');
      }
      return payload.pid;
    } catch {
      throw new BadRequestException('state de OAuth invalido o vencido');
    }
  }

  async exchangeCode(code: string): Promise<MpConnection> {
    const res = await this.oauth().create({
      body: {
        client_id: this.mp.clientId,
        client_secret: this.mp.clientSecret,
        code,
        redirect_uri: this.mp.oauthRedirectUri,
      },
    });
    return this.map(res);
  }

  async refresh(refreshToken: string): Promise<MpConnection> {
    const res = await this.oauth().refresh({
      body: {
        client_id: this.mp.clientId,
        client_secret: this.mp.clientSecret,
        refresh_token: refreshToken,
      },
    });
    return this.map(res);
  }

  private map(res: {
    user_id?: number;
    access_token?: string;
    refresh_token?: string;
    public_key?: string;
    expires_in?: number;
  }): MpConnection {
    return {
      userId: res.user_id != null ? String(res.user_id) : null,
      accessToken: res.access_token ?? null,
      refreshToken: res.refresh_token ?? null,
      publicKey: res.public_key ?? null,
      expiresAt: res.expires_in ? new Date(Date.now() + res.expires_in * 1000) : null,
    };
  }
}
