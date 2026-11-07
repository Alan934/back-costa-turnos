import * as argon2 from 'argon2';
import { VerificationPurpose } from '@/common/enums';
import { MAX_CODE_ATTEMPTS, VerificationTokenService } from './verification-token.service';

/** Repo en memoria mínimo: solo lo que usa VerificationTokenService. */
function makeRepo(initial: Record<string, unknown>[] = []) {
  const rows = initial;
  const matches = (row: Record<string, unknown>, where: Record<string, unknown>) =>
    Object.entries(where).every(([k, v]) => {
      if (v && typeof v === 'object' && '_type' in v) {
        const op = v as { _type: string; _value?: unknown };
        if (op._type === 'isNull') return row[k] == null;
        return true; // MoreThan: no se usa en estos tests
      }
      return row[k] === v;
    });
  return {
    rows,
    create: (d: Record<string, unknown>) => ({
      id: `t${rows.length + 1}`,
      createdAt: new Date(),
      ...d,
    }),
    save: (t: Record<string, unknown>) => {
      rows.push(t);
      return Promise.resolve(t);
    },
    findOne: ({ where }: { where: Record<string, unknown> }) =>
      Promise.resolve([...rows].reverse().find((r) => matches(r, where)) ?? null),
    update: (where: Record<string, unknown>, set: Record<string, unknown>) => {
      let affected = 0;
      for (const r of rows) {
        if (matches(r, where)) {
          Object.assign(r, set);
          affected++;
        }
      }
      return Promise.resolve({ affected });
    },
    createQueryBuilder: () => {
      let id = '';
      const qb = {
        update: () => qb,
        set: () => qb,
        where: (_s: string, p: { id: string }) => {
          id = p.id;
          return qb;
        },
        returning: () => qb,
        execute: () => {
          const r = rows.find((x) => x.id === id && x.usedAt == null);
          if (r) r.attempts = (r.attempts as number) + 1;
          return Promise.resolve({ raw: r ? [{ attempts: r.attempts }] : [] });
        },
      };
      return qb;
    },
  };
}

jest.mock('typeorm', () => {
  const actual = jest.requireActual('typeorm');
  return {
    ...actual,
    IsNull: () => ({ _type: 'isNull' }),
    MoreThan: (v: unknown) => ({ _type: 'moreThan', _value: v }),
  };
});

describe('VerificationTokenService', () => {
  const EMAIL = 'Alguien@Mail.com';
  const P = VerificationPurpose.PasswordReset;

  function setup() {
    const repo = makeRepo();
    const svc = new VerificationTokenService(repo as never);
    return { repo, svc };
  }

  it('acepta el código correcto una sola vez', async () => {
    const { svc } = setup();
    const { code } = await svc.issue({ contact: EMAIL, purpose: P });
    expect(await svc.consume(EMAIL, P, code)).not.toBeNull();
    expect(await svc.consume(EMAIL, P, code)).toBeNull(); // ya usado
  });

  it('normaliza el email (mayúsculas no multiplican intentos)', async () => {
    const { svc } = setup();
    const { code } = await svc.issue({ contact: EMAIL, purpose: P });
    expect(await svc.consume('  alguien@mail.com ', P, code)).not.toBeNull();
  });

  it('quema el código al agotar los intentos, incluso si después llega el correcto', async () => {
    const { svc } = setup();
    const { code } = await svc.issue({ contact: EMAIL, purpose: P });
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < MAX_CODE_ATTEMPTS; i++) {
      expect(await svc.consume(EMAIL, P, wrong)).toBeNull();
    }
    expect(await svc.consume(EMAIL, P, code)).toBeNull();
  });

  it('un código nuevo invalida al anterior (solo sirve el último)', async () => {
    const { svc } = setup();
    const first = await svc.issue({ contact: EMAIL, purpose: P });
    const second = await svc.issue({ contact: EMAIL, purpose: P });
    if (first.code !== second.code) {
      expect(await svc.consume(EMAIL, P, first.code)).toBeNull();
    }
    expect(await svc.consume(EMAIL, P, second.code)).not.toBeNull();
  });

  it('guarda el código hasheado, no en claro', async () => {
    const { svc } = setup();
    const { code, token } = await svc.issue({ contact: EMAIL, purpose: P });
    expect(token.codeHash).not.toBe(code);
    expect(await argon2.verify(token.codeHash, code)).toBe(true);
  });
});
