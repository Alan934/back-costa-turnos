import { Logger } from '@nestjs/common';
import type { ThrottlerStorage } from '@nestjs/throttler';
import type { ThrottlerStorageRecord } from '@nestjs/throttler/dist/throttler-storage-record.interface';
import type Redis from 'ioredis';

/**
 * Storage del rate limit en Redis (ventana fija).
 *
 * El storage por defecto de @nestjs/throttler vive en la memoria del proceso: con varias
 * instancias (escala horizontal en Coolify) cada una cuenta por separado, así que el límite
 * real es N veces mayor, y además se pierde en cada reinicio. En Redis el contador es único.
 *
 * Si Redis falla se deja pasar (fail-open): preferimos no tirar la API por un problema del
 * contador; el error queda logueado.
 */
export class RedisThrottlerStorage implements ThrottlerStorage {
  private readonly logger = new Logger(RedisThrottlerStorage.name);

  constructor(private readonly redis: Redis) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    _blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const redisKey = `throttle:${throttlerName}:${key}`;
    try {
      // INCR + PEXPIRE al primer hit; devuelve [hits, ms restantes].
      const [hits, pttl] = (await this.redis.eval(
        `local hits = redis.call('INCR', KEYS[1])
         if hits == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
         local pttl = redis.call('PTTL', KEYS[1])
         if pttl < 0 then redis.call('PEXPIRE', KEYS[1], ARGV[1]); pttl = tonumber(ARGV[1]) end
         return {hits, pttl}`,
        1,
        redisKey,
        String(ttl),
      )) as [number, number];

      const timeToExpire = Math.ceil(pttl / 1000);
      const isBlocked = hits > limit;
      return {
        totalHits: hits,
        timeToExpire,
        isBlocked,
        timeToBlockExpire: isBlocked ? timeToExpire : 0,
      };
    } catch (err) {
      this.logger.warn(`Rate limit sin Redis, se deja pasar: ${String(err)}`);
      return { totalHits: 0, timeToExpire: 0, isBlocked: false, timeToBlockExpire: 0 };
    }
  }
}
