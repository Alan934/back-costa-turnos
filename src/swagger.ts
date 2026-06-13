import { DocumentBuilder, SwaggerCustomOptions } from '@nestjs/swagger';
import type { OpenAPIObject } from '@nestjs/swagger';

/**
 * Definicion unica del documento OpenAPI. La usan tanto el bootstrap (main.ts)
 * para montar la UI como el script standalone (openapi.ts) que exporta el
 * contrato a packages/contract/openapi.json. No duplicar la config en otro lado.
 */
export function buildSwaggerConfig(): Omit<OpenAPIObject, 'paths'> {
  const localPort = process.env.PORT ?? '3000';
  const prodUrl = process.env.SWAGGER_PROD_URL ?? 'https://api.turnerito.app';

  return new DocumentBuilder()
    .setTitle('Turnerito API')
    .setDescription('API del turnero SaaS multi-tenant')
    .setVersion('1.0')
    .addServer(`http://localhost:${localPort}`, 'Local')
    .addServer(prodUrl, 'Produccion')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'bearer', // nombre del security scheme; coincide con @ApiBearerAuth()
    )
    .build();
}

/**
 * operationId = recurso del controller + metodo, en camelCase
 * (p.ej. `appointmentsList`, `catalogCreate`, `publicBookingBook`). Asi todos los
 * operationId son UNICOS (OpenAPI valido) y orval genera hooks limpios sin que el
 * front tenga que deduplicar. Un `@ApiOperation({ operationId })` explicito en un
 * handler tiene prioridad sobre esta fabrica.
 */
function controllerResource(controllerKey: string): string {
  // 'AppointmentsController' -> 'appointments'; 'ComercioCatalogController' -> 'comercioCatalog'
  const base = controllerKey.replace(/Controller$/, '');
  return base.charAt(0).toLowerCase() + base.slice(1);
}

export const swaggerDocumentOptions = {
  operationIdFactory: (controllerKey: string, methodKey: string): string =>
    `${controllerResource(controllerKey)}${methodKey.charAt(0).toUpperCase()}${methodKey.slice(1)}`,
} as const;

export const swaggerUiOptions: SwaggerCustomOptions = {
  customSiteTitle: 'Turnerito API Docs',
};

/**
 * Prefijos de rutas VERSION_NEUTRAL (sin /v1). Todo lo demas es version 1 y se
 * sirve bajo /v1. NestJS no inyecta el prefijo de version en el documento
 * OpenAPI, asi que lo agregamos aca para que el contrato refleje las URLs reales.
 */
const NEUTRAL_PREFIXES = ['/auth', '/health', '/r/', '/payments/mp/oauth'];

function isNeutralPath(path: string): boolean {
  return NEUTRAL_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`) || path.startsWith(p));
}

/**
 * Reescribe los paths del documento para que coincidan EXACTAMENTE con lo que
 * sirve el backend: las rutas versionadas quedan bajo /v1 y las neutrales sin
 * prefijo. Asi el front usa baseURL = raiz del backend y cada path es completo.
 */
export function applyApiVersionPrefix(document: OpenAPIObject, version = 'v1'): OpenAPIObject {
  const rewritten: OpenAPIObject['paths'] = {};
  for (const [path, item] of Object.entries(document.paths)) {
    const newPath = isNeutralPath(path) ? path : `/${version}${path}`;
    rewritten[newPath] = item;
  }
  document.paths = rewritten;
  return document;
}
