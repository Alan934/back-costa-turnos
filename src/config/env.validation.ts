import * as Joi from 'joi';

/**
 * Esquema de validacion de variables de entorno.
 * Se ejecuta al arrancar la app: si falta algo critico, falla rapido.
 */
export const envValidationSchema = Joi.object({
  // App
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  PORT: Joi.number().default(3000),
  APP_URL: Joi.string().uri().default('http://localhost:3000'),
  CORS_ORIGINS: Joi.string().default('*'),
  DEFAULT_TIMEZONE: Joi.string().default('America/Argentina/Buenos_Aires'),
  LOG_LEVEL: Joi.string().valid('trace', 'debug', 'info', 'warn', 'error', 'fatal').default('info'),

  // Postgres
  DB_HOST: Joi.string().default('localhost'),
  DB_PORT: Joi.number().default(5432),
  DB_USER: Joi.string().required(),
  DB_PASSWORD: Joi.string().allow('').required(),
  DB_NAME: Joi.string().required(),
  DB_SSL: Joi.boolean().default(false),
  DB_LOGGING: Joi.boolean().default(false),

  // Redis
  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().default(6379),
  REDIS_PASSWORD: Joi.string().allow('').default(''),

  // JWT
  JWT_ACCESS_SECRET: Joi.string().min(16).required(),
  JWT_ACCESS_TTL: Joi.string().default('900s'),
  JWT_REFRESH_SECRET: Joi.string().min(16).required(),
  JWT_REFRESH_TTL: Joi.string().default('30d'),

  // Google OAuth (opcional: si no se setea, la estrategia queda inactiva)
  GOOGLE_CLIENT_ID: Joi.string().allow('').default(''),
  GOOGLE_CLIENT_SECRET: Joi.string().allow('').default(''),
  GOOGLE_CALLBACK_URL: Joi.string().uri().default('http://localhost:3000/auth/google/callback'),

  // MercadoPago
  MERCADOPAGO_ACCESS_TOKEN: Joi.string().allow('').default(''),
  MP_WEBHOOK_SECRET: Joi.string().allow('').default(''),
  MP_CLIENT_ID: Joi.string().allow('').default(''),
  MP_CLIENT_SECRET: Joi.string().allow('').default(''),
  MP_OAUTH_REDIRECT_URI: Joi.string()
    .uri()
    .default('http://localhost:3000/payments/mp/oauth/callback'),
  MP_MARKETPLACE_FEE_PERCENT: Joi.number().min(0).max(100).default(0),
  MP_FRONT_RETURN_URL: Joi.string().uri().optional(),

  // Suscripcion (trial / gracia / precio)
  SUBSCRIPTION_TRIAL_DAYS: Joi.number().default(15),
  SUBSCRIPTION_GRACE_DAYS: Joi.number().default(3),
  SUBSCRIPTION_PRICE_CENTS: Joi.number().default(1100000),

  // MinIO
  MINIO_ENDPOINT: Joi.string().default('localhost'),
  MINIO_PORT: Joi.number().default(9000),
  MINIO_USE_SSL: Joi.boolean().default(false),
  MINIO_ACCESS_KEY: Joi.string().default('minioadmin'),
  MINIO_SECRET_KEY: Joi.string().default('minioadmin'),
  MINIO_BUCKET: Joi.string().default('turnerito'),

  // Notificaciones (stub)
  MAIL_FROM: Joi.string().default('no-reply@turnerito.app'),
  MAIL_HOST: Joi.string().allow('').default(''),
  MAIL_PORT: Joi.number().default(587),
  MAIL_USER: Joi.string().allow('').default(''),
  MAIL_PASSWORD: Joi.string().allow('').default(''),
  WHATSAPP_API_URL: Joi.string().allow('').default(''),
  WHATSAPP_API_TOKEN: Joi.string().allow('').default(''),

  // Throttler
  THROTTLE_TTL: Joi.number().default(60000),
  THROTTLE_LIMIT: Joi.number().default(120),

  // Archivos (limites de subida y compresion de imagenes)
  FILE_MAX_IMAGE_MB: Joi.number().default(10),
  FILE_MAX_PDF_MB: Joi.number().default(3),
  FILE_IMAGE_MAX_WIDTH: Joi.number().default(2000),
  FILE_IMAGE_WEBP_QUALITY: Joi.number().min(1).max(100).default(85),
  FILE_IMAGE_TARGET_KB: Joi.number().default(1536),
});
