import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { TokensService } from './tokens.service';

jest.mock('typeorm', () => {
  const actual = jest.requireActual('typeorm');
  return {
    ...actual,
    MoreThan: (v: unknown) => ({ _op: 'moreThan', v }),
    LessThan: (v: unknown) => ({ _op: 'lessThan', v }),
  };
});

type Row = Record<string, any>;

/** Repo en memoria mínimo para AuthSession. */
function sessionsRepo() {
  const rows: Row[] = [];
  const match = (r: Row, w: Row) =>
    Object.entries(w).every(([k, v]) =>
      v && typeof v === 'object' && '_op' in v
        ? (v as { _op: string; v: Date })._op === 'moreThan'
          ? (r[k] as Date) > (v as { v: Date }).v
          : (r[k] as Date) < (v as { v: Date }).v
        : r[k] === v,
    );
  return {
    rows,
    create: (d: Row) => ({ createdAt: new Date(), ...d }),
    save: (r: Row) => {
      rows.push(r);
      return Promise.resolve(r);
    },
    findOne: ({ where }: { where: Row }) =>
      Promise.resolve(rows.find((r) => match(r, where)) ?? null),
    find: () => Promise.resolve([]),
    update: (w: Row, set: Row) => {
      rows.filter((r) => match(r, w)).forEach((r) => Object.assign(r, set));
      return Promise.resolve({ affected: 1 });
    },
    delete: (w: Row | string[]) => {
      const keep = rows.filter((r) => (Array.isArray(w) ? !w.includes(r.id) : !match(r, w)));
      rows.length = 0;
      rows.push(...keep);
      return Promise.resolve({ affected: 1 });
    },
  };
}

function setup() {
  const jwt = new JwtService({});
  const config = {
    getOrThrow: () => ({
      accessSecret: 'a'.repeat(40),
      accessTtl: '900s',
      refreshSecret: 'r'.repeat(40),
      refreshTtl: '30d',
    }),
  };
  const tokens = new TokensService(jwt, config as never);
  const account = {
    id: 'acc-1',
    email: 'a@b.com',
    status: 'active',
    isPlatformAdmin: false,
    emailVerifiedAt: new Date(),
    refreshTokenHash: null,
  };
  const sessions = sessionsRepo();
  const accounts = {
    findById: jest.fn().mockResolvedValue(account),
    setRefreshTokenHash: jest.fn().mockResolvedValue(undefined),
  };
  const none = { findOne: jest.fn().mockResolvedValue(null) };
  const comercios = {
    getOwnedComercios: jest.fn().mockResolvedValue([]),
    listMembershipComercioIds: jest.fn().mockResolvedValue([]),
  };
  const auth = new AuthService(
    accounts as never,
    {} as never,
    tokens,
    {} as never,
    {} as never,
    {} as never,
    comercios as never,
    none as never,
    none as never,
    {} as never,
    sessions as never,
  );
  return { auth, sessions, account };
}

describe('AuthService sesiones (refresh rotativo)', () => {
  it('cada login abre una sesión propia (otro dispositivo no cierra la anterior)', async () => {
    const { auth, sessions, account } = setup();
    const issue = (auth as any).issueAndPersist.bind(auth);
    const a = await issue(account);
    const b = await issue(account);
    expect(sessions.rows).toHaveLength(2);
    // ambos refresh siguen sirviendo
    await expect(auth.refresh(a.refreshToken)).resolves.toBeDefined();
    await expect(auth.refresh(b.refreshToken)).resolves.toBeDefined();
  });

  it('el refresh rota: devuelve un token nuevo distinto', async () => {
    const { auth, account } = setup();
    const first = await (auth as any).issueAndPersist(account);
    const second = await auth.refresh(first.refreshToken);
    expect(second.refreshToken).not.toBe(first.refreshToken);
    await expect(auth.refresh(second.refreshToken)).resolves.toBeDefined();
  });

  it('tolera el token anterior unos segundos (pestañas concurrentes)', async () => {
    const { auth, account } = setup();
    const first = await (auth as any).issueAndPersist(account);
    await auth.refresh(first.refreshToken);
    await expect(auth.refresh(first.refreshToken)).resolves.toBeDefined();
  });

  it('reuso de un token viejo fuera de la gracia: revoca la sesión entera', async () => {
    const { auth, sessions, account } = setup();
    const first = await (auth as any).issueAndPersist(account);
    const second = await auth.refresh(first.refreshToken);
    sessions.rows[0].rotatedAt = new Date(Date.now() - 5 * 60_000); // pasó la gracia
    await expect(auth.refresh(first.refreshToken)).rejects.toBeInstanceOf(UnauthorizedException);
    // y el token legítimo más nuevo también deja de servir (sesión cerrada)
    await expect(auth.refresh(second.refreshToken)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('logout con sid cierra solo esa sesión', async () => {
    const { auth, sessions, account } = setup();
    const a = await (auth as any).issueAndPersist(account);
    const b = await (auth as any).issueAndPersist(account);
    const sidA = sessions.rows[0].id as string;
    await auth.logout(account.id, sidA);
    await expect(auth.refresh(a.refreshToken)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(auth.refresh(b.refreshToken)).resolves.toBeDefined();
  });
});
