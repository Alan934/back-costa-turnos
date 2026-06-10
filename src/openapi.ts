import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { applyApiVersionPrefix, buildSwaggerConfig, swaggerDocumentOptions } from './swagger';

/**
 * Genera el contrato OpenAPI sin levantar el servidor HTTP. Construye la app en
 * modo "application context" (headless), arma el documento con la MISMA config
 * que usa main.ts y lo escribe a packages/contract/openapi.json.
 *
 * Uso: npm run openapi:gen
 */
async function generate(): Promise<void> {
  const app = await NestFactory.create(AppModule, { logger: false });
  await app.init();

  const document = applyApiVersionPrefix(
    SwaggerModule.createDocument(app, buildSwaggerConfig(), swaggerDocumentOptions),
  );

  const outPath = resolve(__dirname, '..', '..', 'packages', 'contract', 'openapi.json');
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(document, null, 2)}\n`, 'utf8');

  const pathCount = Object.keys(document.paths ?? {}).length;
  const opCount = Object.values(document.paths ?? {}).reduce(
    (acc, item) => acc + Object.keys(item).length,
    0,
  );
  // eslint-disable-next-line no-console
  console.log(`OpenAPI generado: ${outPath} (${pathCount} rutas, ${opCount} operaciones)`);

  await app.close();
}

generate()
  .then(() => process.exit(0))
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('Error generando OpenAPI:', err);
    process.exit(1);
  });
