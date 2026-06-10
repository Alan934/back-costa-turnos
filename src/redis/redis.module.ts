import { Global, Module, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { RedisConfig } from '@/config/configuration';

export const REDIS_CLIENT = 'REDIS_CLIENT';

/**
 * Cliente ioredis compartido (cache manual, adapter de websocket, etc.).
 * BullMQ recibe su propia config de conexion en BullModule.
 */
@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const redis = config.getOrThrow<RedisConfig>('redis');
        return new Redis({
          host: redis.host,
          port: redis.port,
          password: redis.password,
          maxRetriesPerRequest: null,
        });
      },
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule implements OnModuleDestroy {
  constructor() {}

  onModuleDestroy(): void {
    // los clientes se cierran al destruirse el proceso; ioredis maneja reconexion.
  }
}
