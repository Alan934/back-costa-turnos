import { RedisThrottlerStorage } from './redis-throttler.storage';

/** Simula el script Lua: INCR + PEXPIRE en el primer hit. */
function fakeRedis() {
  const counters = new Map<string, number>();
  return {
    eval: jest.fn((_script: string, _n: number, key: string, ttl: string) => {
      const hits = (counters.get(key) ?? 0) + 1;
      counters.set(key, hits);
      return Promise.resolve([hits, Number(ttl)]);
    }),
  };
}

describe('RedisThrottlerStorage', () => {
  it('cuenta hits y bloquea al superar el límite', async () => {
    const storage = new RedisThrottlerStorage(fakeRedis() as never);
    const r1 = await storage.increment('ip1', 60_000, 2, 0, 'default');
    const r2 = await storage.increment('ip1', 60_000, 2, 0, 'default');
    const r3 = await storage.increment('ip1', 60_000, 2, 0, 'default');
    expect([r1.isBlocked, r2.isBlocked, r3.isBlocked]).toEqual([false, false, true]);
    expect(r3.totalHits).toBe(3);
    expect(r3.timeToExpire).toBe(60);
  });

  it('claves distintas no se mezclan', async () => {
    const storage = new RedisThrottlerStorage(fakeRedis() as never);
    await storage.increment('ip1', 60_000, 1, 0, 'default');
    const other = await storage.increment('ip2', 60_000, 1, 0, 'default');
    expect(other.isBlocked).toBe(false);
  });

  it('si Redis falla, deja pasar (fail-open)', async () => {
    const broken = { eval: jest.fn().mockRejectedValue(new Error('down')) };
    const storage = new RedisThrottlerStorage(broken as never);
    const r = await storage.increment('ip1', 60_000, 1, 0, 'default');
    expect(r.isBlocked).toBe(false);
  });
});
