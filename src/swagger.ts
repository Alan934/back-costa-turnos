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
 * operationId = nombre del metodo del controller (camelCase). Asi orval genera
 * hooks limpios (p.ej. `useListAppointments`) en vez de `AppointmentsController_list`.
 */
export const swaggerDocumentOptions = {
  operationIdFactory: (_controllerKey: string, methodKey: string): string => methodKey,
} as const;

export const swaggerUiOptions: SwaggerCustomOptions = {
  customSiteTitle: 'Turnerito API Docs',
};
