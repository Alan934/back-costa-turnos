import { NestFactory } from '@nestjs/core';
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
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  // Logger estructurado (pino)
  app.useLogger(app.get(Logger));

  const config = app.get(ConfigService);
  const appConfig = config.getOrThrow<AppConfig>('app');

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
  await app.listen(appConfig.port);
  app.get(Logger).log(`Turnerito API escuchando en :${appConfig.port}`, 'Bootstrap');
}

void bootstrap();
