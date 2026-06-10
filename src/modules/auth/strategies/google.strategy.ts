import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Profile, Strategy, VerifyCallback } from 'passport-google-oauth20';
import { ConfigService } from '@nestjs/config';
import { GoogleConfig } from '@/config/configuration';
import { GoogleProfileInput } from '../auth.service';

/**
 * Estrategia Google OAuth 2.0. Si no hay credenciales configuradas usa valores
 * dummy; las rutas /auth/google fallaran en runtime hasta configurar las ENV.
 */
@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(config: ConfigService) {
    const google = config.getOrThrow<GoogleConfig>('google');
    super({
      clientID: google.clientId || 'not-configured',
      clientSecret: google.clientSecret || 'not-configured',
      callbackURL: google.callbackUrl,
      scope: ['email', 'profile'],
    });
  }

  validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
    done: VerifyCallback,
  ): void {
    const email = profile.emails?.[0]?.value;
    if (!email) {
      done(new Error('Google no devolvio email'), undefined);
      return;
    }
    const user: GoogleProfileInput = {
      googleId: profile.id,
      email,
      fullName: profile.displayName || email,
    };
    done(null, user);
  }
}
