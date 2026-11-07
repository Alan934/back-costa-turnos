import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';
import { MpWebhookGuard } from './mp-webhook.guard';

const SECRET = 'test-secret';

function config(env: string, secret: string): ConfigService {
  return {
    getOrThrow: (key: string) => (key === 'mercadopago' ? { webhookSecret: secret } : { env }),
  } as unknown as ConfigService;
}

function ctx(headers: Record<string, string>, query: Record<string, string> = {}, body = {}) {
  const req = {
    header: (name: string) => headers[name.toLowerCase()],
    query,
    body,
  };
  return { switchToHttp: () => ({ getRequest: () => req }) } as never;
}

function sign(dataId: string, requestId: string, ts: string, secret = SECRET): string {
  const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`;
  return createHmac('sha256', secret).update(manifest).digest('hex');
}

describe('MpWebhookGuard', () => {
  it('acepta una firma válida', () => {
    const guard = new MpWebhookGuard(config('production', SECRET));
    const v1 = sign('123456', 'req-1', '1700000000000');
    const ok = guard.canActivate(
      ctx(
        { 'x-signature': `ts=1700000000000,v1=${v1}`, 'x-request-id': 'req-1' },
        { 'data.id': '123456' },
      ),
    );
    expect(ok).toBe(true);
  });

  it('rechaza una firma falsa o de otro secreto', () => {
    const guard = new MpWebhookGuard(config('production', SECRET));
    const v1 = sign('123456', 'req-1', '1700000000000', 'otro-secreto');
    expect(() =>
      guard.canActivate(
        ctx(
          { 'x-signature': `ts=1700000000000,v1=${v1}`, 'x-request-id': 'req-1' },
          { 'data.id': '123456' },
        ),
      ),
    ).toThrow(UnauthorizedException);
  });

  it('rechaza si cambia el id del recurso firmado', () => {
    const guard = new MpWebhookGuard(config('production', SECRET));
    const v1 = sign('123456', 'req-1', '1700000000000');
    expect(() =>
      guard.canActivate(
        ctx(
          { 'x-signature': `ts=1700000000000,v1=${v1}`, 'x-request-id': 'req-1' },
          { 'data.id': '999999' },
        ),
      ),
    ).toThrow(UnauthorizedException);
  });

  it('rechaza sin header de firma', () => {
    const guard = new MpWebhookGuard(config('development', SECRET));
    expect(() => guard.canActivate(ctx({}, { 'data.id': '1' }))).toThrow(UnauthorizedException);
  });

  it('sin secreto: rechaza en producción', () => {
    const guard = new MpWebhookGuard(config('production', ''));
    expect(() => guard.canActivate(ctx({}))).toThrow(UnauthorizedException);
  });

  it('sin secreto: deja pasar en desarrollo (stub local)', () => {
    const guard = new MpWebhookGuard(config('development', ''));
    expect(guard.canActivate(ctx({}))).toBe(true);
  });
});
