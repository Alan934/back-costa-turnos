/**
 * Configuracion tipada de la app, derivada de las ENV ya validadas por Joi.
 * Se accede via ConfigService.get<...>('app'|'db'|...).
 */
export interface AppConfig {
  env: string;
  port: number;
  appUrl: string;
  corsOrigins: string[] | boolean;
  defaultTimezone: string;
  logLevel: string;
}

export interface DbConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  name: string;
  ssl: boolean;
  logging: boolean;
}

export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
}

export interface JwtConfig {
  accessSecret: string;
  accessTtl: string;
  refreshSecret: string;
  refreshTtl: string;
}

export interface GoogleConfig {
  clientId: string;
  clientSecret: string;
  callbackUrl: string;
  enabled: boolean;
}

export interface MercadoPagoConfig {
  /** Access token de la PLATAFORMA (cobra las suscripciones). */
  accessToken: string;
  webhookSecret: string;
  /** App de MP para el OAuth de los profesionales (marketplace). */
  clientId: string;
  clientSecret: string;
  /** A donde vuelve MP tras autorizar la conexion del profesional. */
  oauthRedirectUri: string;
  /** Comision de la plataforma sobre las señas/turnos (0 = el profesional cobra todo). */
  marketplaceFeePercent: number;
  /** URL del front a la que se redirige tras volver del checkout / OAuth. */
  frontReturnUrl: string;
}

export interface SubscriptionConfig {
  /** Dias de prueba gratis al crearse el profesional. */
  trialDays: number;
  /** Dias de gracia tras vencer el periodo antes de bloquear escritura. */
  graceDays: number;
  /** Precio mensual de la suscripcion (centavos). */
  priceCents: number;
}

export interface MinioConfig {
  endpoint: string;
  port: number;
  useSsl: boolean;
  accessKey: string;
  secretKey: string;
  bucket: string;
}

export interface MailConfig {
  from: string;
  host: string;
  port: number;
  user: string;
  password: string;
}

export interface WhatsappConfig {
  apiUrl: string;
  apiToken: string;
}

export interface ThrottleConfig {
  ttl: number;
  limit: number;
}

export interface FilesConfig {
  /** Tope de entrada para imagenes (bytes); se comprimen luego. */
  maxImageBytes: number;
  /** Tope para PDFs (bytes); no se comprimen, se rechazan si superan. */
  maxPdfBytes: number;
  /** Ancho maximo al redimensionar imagenes. */
  imageMaxWidth: number;
  /** Calidad webp inicial (se baja iterativamente si no entra en el target). */
  imageWebpQuality: number;
  /** Peso objetivo de la imagen comprimida (bytes). */
  imageTargetBytes: number;
}

function parseCors(value: string): string[] | boolean {
  if (!value || value === '*') return true;
  return value
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
}

export default () => ({
  app: {
    env: process.env.NODE_ENV ?? 'development',
    port: parseInt(process.env.PORT ?? '3000', 10),
    appUrl: process.env.APP_URL ?? 'http://localhost:3000',
    corsOrigins: parseCors(process.env.CORS_ORIGINS ?? '*'),
    defaultTimezone: process.env.DEFAULT_TIMEZONE ?? 'America/Argentina/Buenos_Aires',
    logLevel: process.env.LOG_LEVEL ?? 'info',
  } satisfies AppConfig,

  db: {
    host: process.env.DB_HOST ?? 'localhost',
    port: parseInt(process.env.DB_PORT ?? '5432', 10),
    user: process.env.DB_USER!,
    password: process.env.DB_PASSWORD ?? '',
    name: process.env.DB_NAME!,
    ssl: process.env.DB_SSL === 'true',
    logging: process.env.DB_LOGGING === 'true',
  } satisfies DbConfig,

  redis: {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
  } satisfies RedisConfig,

  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET!,
    accessTtl: process.env.JWT_ACCESS_TTL ?? '900s',
    refreshSecret: process.env.JWT_REFRESH_SECRET!,
    refreshTtl: process.env.JWT_REFRESH_TTL ?? '30d',
  } satisfies JwtConfig,

  google: {
    clientId: process.env.GOOGLE_CLIENT_ID ?? '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
    callbackUrl: process.env.GOOGLE_CALLBACK_URL ?? 'http://localhost:3000/auth/google/callback',
    enabled: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
  } satisfies GoogleConfig,

  mercadopago: {
    accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN ?? '',
    webhookSecret: process.env.MP_WEBHOOK_SECRET ?? '',
    clientId: process.env.MP_CLIENT_ID ?? '',
    clientSecret: process.env.MP_CLIENT_SECRET ?? '',
    oauthRedirectUri:
      process.env.MP_OAUTH_REDIRECT_URI ?? 'http://localhost:3000/payments/mp/oauth/callback',
    marketplaceFeePercent: parseFloat(process.env.MP_MARKETPLACE_FEE_PERCENT ?? '0'),
    frontReturnUrl: process.env.MP_FRONT_RETURN_URL ?? process.env.APP_URL ?? 'http://localhost:3000',
  } satisfies MercadoPagoConfig,

  subscription: {
    trialDays: parseInt(process.env.SUBSCRIPTION_TRIAL_DAYS ?? '15', 10),
    graceDays: parseInt(process.env.SUBSCRIPTION_GRACE_DAYS ?? '3', 10),
    priceCents: parseInt(process.env.SUBSCRIPTION_PRICE_CENTS ?? '1100000', 10),
  } satisfies SubscriptionConfig,

  minio: {
    endpoint: process.env.MINIO_ENDPOINT ?? 'localhost',
    port: parseInt(process.env.MINIO_PORT ?? '9000', 10),
    useSsl: process.env.MINIO_USE_SSL === 'true',
    accessKey: process.env.MINIO_ACCESS_KEY ?? 'minioadmin',
    secretKey: process.env.MINIO_SECRET_KEY ?? 'minioadmin',
    bucket: process.env.MINIO_BUCKET ?? 'turnerito',
  } satisfies MinioConfig,

  mail: {
    from: process.env.MAIL_FROM ?? 'no-reply@turnerito.app',
    host: process.env.MAIL_HOST ?? '',
    port: parseInt(process.env.MAIL_PORT ?? '587', 10),
    user: process.env.MAIL_USER ?? '',
    password: process.env.MAIL_PASSWORD ?? '',
  } satisfies MailConfig,

  whatsapp: {
    apiUrl: process.env.WHATSAPP_API_URL ?? '',
    apiToken: process.env.WHATSAPP_API_TOKEN ?? '',
  } satisfies WhatsappConfig,

  throttle: {
    ttl: parseInt(process.env.THROTTLE_TTL ?? '60000', 10),
    limit: parseInt(process.env.THROTTLE_LIMIT ?? '120', 10),
  } satisfies ThrottleConfig,

  files: {
    maxImageBytes: parseInt(process.env.FILE_MAX_IMAGE_MB ?? '10', 10) * 1024 * 1024,
    maxPdfBytes: parseInt(process.env.FILE_MAX_PDF_MB ?? '3', 10) * 1024 * 1024,
    imageMaxWidth: parseInt(process.env.FILE_IMAGE_MAX_WIDTH ?? '2000', 10),
    imageWebpQuality: parseInt(process.env.FILE_IMAGE_WEBP_QUALITY ?? '85', 10),
    imageTargetBytes: parseInt(process.env.FILE_IMAGE_TARGET_KB ?? '1536', 10) * 1024,
  } satisfies FilesConfig,
});
