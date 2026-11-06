import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig, JwtConfig, MercadoPagoConfig, MinioConfig } from '@/config/configuration';

const MIN_SECRET_LENGTH = 32;
const DEFAULT_MINIO = new Set(['minioadmin', 'minio', 'admin']);

/**
 * Revisa la configuración de seguridad al arrancar y AVISA (no frena el arranque) de lo
 * débil: secretos cortos o repetidos, credenciales por defecto, MinIO sin TLS, etc.
 * Solo en producción: en desarrollo estos valores son normales.
 * Devuelve los avisos (también útil para tests).
 */
export function collectSecurityWarnings(config: ConfigService): string[] {
  const app = config.getOrThrow<AppConfig>('app');
  if (app.env !== 'production') return [];

  const jwt = config.getOrThrow<JwtConfig>('jwt');
  const minio = config.getOrThrow<MinioConfig>('minio');
  const mp = config.getOrThrow<MercadoPagoConfig>('mercadopago');
  const out: string[] = [];

  if (jwt.accessSecret.length < MIN_SECRET_LENGTH) {
    out.push(
      `JWT_ACCESS_SECRET tiene ${jwt.accessSecret.length} caracteres (recomendado ≥ ${MIN_SECRET_LENGTH}).`,
    );
  }
  if (jwt.refreshSecret.length < MIN_SECRET_LENGTH) {
    out.push(
      `JWT_REFRESH_SECRET tiene ${jwt.refreshSecret.length} caracteres (recomendado ≥ ${MIN_SECRET_LENGTH}).`,
    );
  }
  if (jwt.accessSecret === jwt.refreshSecret) {
    out.push('JWT_ACCESS_SECRET y JWT_REFRESH_SECRET son iguales: deben ser distintos.');
  }
  if (DEFAULT_MINIO.has(minio.accessKey) || DEFAULT_MINIO.has(minio.secretKey)) {
    out.push(
      'MinIO usa credenciales por defecto (minioadmin): cambiá MINIO_ACCESS_KEY/SECRET_KEY.',
    );
  }
  if (!minio.useSsl) {
    out.push(
      'MINIO_USE_SSL=false: las URLs firmadas saldrán por HTTP (contenido mixto en un front HTTPS).',
    );
  }
  if (mp.accessToken && !mp.webhookSecret) {
    out.push(
      'Hay MERCADOPAGO_ACCESS_TOKEN pero falta MP_WEBHOOK_SECRET: el webhook rechazará todo.',
    );
  }
  if (!app.trustProxy) {
    out.push(
      'TRUST_PROXY no está seteado: detrás de un proxy el rate limit verá una sola IP para todos.',
    );
  }
  return out;
}

export function logSecurityWarnings(config: ConfigService): void {
  const logger = new Logger('Security');
  for (const w of collectSecurityWarnings(config)) logger.warn(w);
}
