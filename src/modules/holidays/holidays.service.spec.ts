import { BadRequestException, NotFoundException } from '@nestjs/common';
import { HolidaysService, parseApiHolidays, resolveWorks } from './holidays.service';

describe('resolveWorks', () => {
  it('sin excepción usa el ajuste general', () => {
    expect(resolveWorks(true, undefined)).toBe(true);
    expect(resolveWorks(false, undefined)).toBe(false);
  });

  it('la excepción puntual pisa el ajuste general en ambos sentidos', () => {
    expect(resolveWorks(false, true)).toBe(true); // no trabajo feriados, pero este sí
    expect(resolveWorks(true, false)).toBe(false); // trabajo feriados, pero este no
  });
});

describe('parseApiHolidays', () => {
  it('normaliza y descarta items mal formados o de otro año', () => {
    const out = parseApiHolidays(
      [
        { fecha: '2026-01-01', tipo: 'inamovible', nombre: ' Año nuevo ' },
        { fecha: '2026-02-30x', tipo: 'inamovible', nombre: 'Basura' },
        { fecha: '2025-12-25', tipo: 'inamovible', nombre: 'Otro año' },
        { fecha: '2026-03-23', nombre: 'Sin tipo' },
        { tipo: 'puente' },
        null,
      ],
      2026,
    );
    expect(out).toEqual([
      { fecha: '2026-01-01', tipo: 'inamovible', nombre: 'Año nuevo' },
      { fecha: '2026-03-23', tipo: 'inamovible', nombre: 'Sin tipo' },
    ]);
  });

  it('una fecha repetida se guarda una sola vez (gana la primera)', () => {
    const out = parseApiHolidays(
      [
        { fecha: '2026-02-16', tipo: 'inamovible', nombre: 'Carnaval' },
        { fecha: '2026-02-16', tipo: 'inamovible', nombre: 'Duplicado' },
      ],
      2026,
    );
    expect(out).toHaveLength(1);
    expect(out[0].nombre).toBe('Carnaval');
  });

  it('rechaza una respuesta que no es una lista', () => {
    expect(() => parseApiHolidays({ error: 'x' }, 2026)).toThrow();
  });
});

describe('HolidaysService', () => {
  const makeService = (holidayRows: { date: string; name: string; kind: string }[] = []) => {
    const holidays = {
      find: jest.fn().mockResolvedValue(holidayRows),
      count: jest.fn(),
      exists: jest.fn(),
      upsert: jest.fn().mockResolvedValue(undefined),
      createQueryBuilder: jest.fn(),
    };
    const overrides = {
      find: jest.fn().mockResolvedValue([]),
      upsert: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    const service = new HolidaysService(holidays as never, overrides as never);
    return { service, holidays, overrides };
  };

  const rows = [
    { date: '2026-05-01', name: 'Día del Trabajador', kind: 'inamovible' },
    { date: '2026-05-25', name: 'Revolución de Mayo', kind: 'inamovible' },
  ];

  it('con worksHolidays=false todos bloquean, salvo el que tiene excepción "sí trabajo"', async () => {
    const { service, overrides } = makeService(rows);
    overrides.find.mockResolvedValue([{ date: '2026-05-25', works: true }]);

    const blocked = await service.listBlockedForMembership(
      { id: 'm1', worksHolidays: false },
      '2026-05-01',
      '2026-05-31',
    );
    expect(blocked.map((h) => h.date)).toEqual(['2026-05-01']);

    const all = await service.listForMembership(
      { id: 'm1', worksHolidays: false },
      '2026-05-01',
      '2026-05-31',
    );
    expect(all.find((h) => h.date === '2026-05-25')).toMatchObject({
      works: true,
      overridden: true,
    });
    expect(all.find((h) => h.date === '2026-05-01')).toMatchObject({
      works: false,
      overridden: false,
    });
  });

  it('con worksHolidays=true nada bloquea, salvo el que tiene excepción "no trabajo"', async () => {
    const { service, overrides } = makeService(rows);
    overrides.find.mockResolvedValue([{ date: '2026-05-01', works: false }]);

    const blocked = await service.listBlockedForMembership(
      { id: 'm1', worksHolidays: true },
      '2026-05-01',
      '2026-05-31',
    );
    expect(blocked.map((h) => h.date)).toEqual(['2026-05-01']);
  });

  it('setOverride exige que la fecha sea un feriado y valida el formato', async () => {
    const { service, holidays, overrides } = makeService();
    holidays.exists.mockResolvedValue(false);
    await expect(service.setOverride('m1', '2026-05-02', true)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.setOverride('m1', 'mañana', true)).rejects.toBeInstanceOf(
      BadRequestException,
    );

    holidays.exists.mockResolvedValue(true);
    await service.setOverride('m1', '2026-05-25', true);
    expect(overrides.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ membershipId: 'm1', date: '2026-05-25', works: true }),
      ['membershipId', 'date'],
    );
  });

  describe('syncYear', () => {
    const originalFetch = global.fetch;
    afterEach(() => {
      global.fetch = originalFetch;
    });

    const mockFetch = (body: unknown, ok = true, status = 200) => {
      global.fetch = jest.fn().mockResolvedValue({
        ok,
        status,
        json: () => Promise.resolve(body),
      }) as never;
    };

    it('hace upsert por fecha y borra los feriados del año que la API ya no lista', async () => {
      const { service, holidays } = makeService();
      const execute = jest.fn().mockResolvedValue(undefined);
      const qb = { delete: jest.fn(), where: jest.fn(), andWhere: jest.fn(), execute };
      qb.delete.mockReturnValue(qb);
      qb.where.mockReturnValue(qb);
      qb.andWhere.mockReturnValue(qb);
      holidays.createQueryBuilder.mockReturnValue(qb);
      mockFetch([
        { fecha: '2026-01-01', tipo: 'inamovible', nombre: 'Año nuevo' },
        { fecha: '2026-05-01', tipo: 'inamovible', nombre: 'Día del Trabajador' },
      ]);

      await expect(service.syncYear(2026)).resolves.toBe(2);

      const [upsertRows, conflictCols] = holidays.upsert.mock.calls[0] as [
        { id: string; date: string; name: string; kind: string }[],
        string[],
      ];
      expect(conflictCols).toEqual(['date']);
      expect(upsertRows.map((r) => r.date)).toEqual(['2026-01-01', '2026-05-01']);
      expect(upsertRows.every((r) => typeof r.id === 'string' && r.id.length > 0)).toBe(true);
      expect(qb.andWhere).toHaveBeenCalledWith('date NOT IN (:...dates)', {
        dates: ['2026-01-01', '2026-05-01'],
      });
      expect(execute).toHaveBeenCalled();
    });

    it('si la API devuelve una lista vacía no toca la base', async () => {
      const { service, holidays } = makeService();
      mockFetch([]);
      await expect(service.syncYear(2027)).resolves.toBe(0);
      expect(holidays.upsert).not.toHaveBeenCalled();
      expect(holidays.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('un HTTP de error lanza y no toca la base', async () => {
      const { service, holidays } = makeService();
      mockFetch(null, false, 503);
      await expect(service.syncYear(2026)).rejects.toThrow('503');
      expect(holidays.upsert).not.toHaveBeenCalled();
    });

    it('syncCurrentAndNextYear nunca lanza aunque la API falle', async () => {
      const { service } = makeService();
      mockFetch(null, false, 500);
      await expect(service.syncCurrentAndNextYear()).resolves.toBeUndefined();
    });
  });
});
