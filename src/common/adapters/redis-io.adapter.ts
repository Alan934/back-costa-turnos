import { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { ConfigService } from '@nestjs/config';
import { ServerOptions } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import { AppConfig, RedisConfig } from '@/config/configuration';

/**
 * Adapter de Socket.IO con backend Redis para que la sala de espera funcione
 * con multiples instancias de la app (escala horizontal en Coolify).
 */
export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor?: ReturnType<typeof createAdapter>;

  constructor(private readonly app: INestApplicationContext) {
    super(app);
  }

  async connectToRedis(): Promise<void> {
    const config = this.app.get(ConfigService);
    const redis = config.getOrThrow<RedisConfig>('redis');
    const pubClient = new Redis({
      host: redis.host,
      port: redis.port,
      password: redis.password,
      maxRetriesPerRequest: null,
    });
    const subClient = pubClient.duplicate();
    await Promise.all([pubClient.ping(), subClient.ping()]);
    this.adapterConstructor = createAdapter(pubClient, subClient);
  }

  createIOServer(port: number, options?: ServerOptions): any {
    // CORS del WebSocket con la MISMA lista que la API (CORS_ORIGINS), no '*'.
    const { corsOrigins } = this.app.get(ConfigService).getOrThrow<AppConfig>('app');
    const server = super.createIOServer(port, {
      ...options,
      cors: { origin: corsOrigins, credentials: true },
    });
    if (this.adapterConstructor) {
      server.adapter(this.adapterConstructor);
    }
    return server;
  }
}
