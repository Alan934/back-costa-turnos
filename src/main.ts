import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AppConfig } from './config/configuration';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { RedisIoAdapter } from './common/adapters/redis-io.adapter';
import {
  applyApiVersionPrefix,
  buildSwaggerConfig,
  swaggerDocumentOptions,
  swaggerUiOptions,
} from './swagger';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });

  // Logger estructurado (pino)
  app.useLogger(app.get(Logger));

  const config = app.get(ConfigService);
  const appConfig = config.getOrThrow<AppConfig>('app');

  // IP real del cliente detrás del proxy (rate limit por usuario). Solo si TRUST_PROXY está seteado.
  if (appConfig.trustProxy !== false) app.set('trust proxy', appConfig.trustProxy);

  app.use(helmet());
  app.enableCors({ origin: appConfig.corsOrigins, credentials: true });
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());

  // Adapter Redis para websockets (sala de espera multi-instancia)
  const redisIoAdapter = new RedisIoAdapter(app);
  await redisIoAdapter.connectToRedis();
  app.useWebSocketAdapter(redisIoAdapter);

  // Swagger / OpenAPI (config compartida con el script de export, ver src/swagger.ts)
  const document = applyApiVersionPrefix(
    SwaggerModule.createDocument(app, buildSwaggerConfig(), swaggerDocumentOptions),
  );
  SwaggerModule.setup('api/docs', app, document, swaggerUiOptions);

  app.enableShutdownHooks();
  await app.listen(appConfig.port, '0.0.0.0');
  app.get(Logger).log(`Turnerito API escuchando en :${appConfig.port}`, 'Bootstrap');
}

void bootstrap();
