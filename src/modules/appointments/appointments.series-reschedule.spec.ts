import { BadRequestException, ConflictException } from '@nestjs/common';
import { AppointmentStatus, TimeOffType } from '@/common/enums';
import { AppointmentsService } from './appointments.service';

/**
 * Turnos fijos y cambio de horario desde el panel. Se prueba la lógica propia de cada
 * método; la reserva de cada fecha (`book`), los avisos y la agenda se reemplazan por dobles.
 */
const AR = 'America/Argentina/Buenos_Aires';

describe('AppointmentsService.bookSeries — turnos fijos', () => {
  function setup(opts: { blockedIso?: string[]; conflictIso?: string[] } = {}) {
    const svc = Object.create(AppointmentsService.prototype) as AppointmentsService;
    const book = jest.fn((...args: unknown[]) => {
      const dto = args[1] as { startAt: string };
      if (opts.conflictIso?.includes(dto.startAt)) {
        return Promise.reject(new ConflictException('El horario ya esta disponible.'));
      }
      return Promise.resolve({ id: `a-${dto.startAt}`, startAt: new Date(dto.startAt) });
    });
    const notifyBooked = jest.fn().mockResolvedValue(undefined);
    Object.assign(svc, {
      loadService: jest.fn().mockResolvedValue({ id: 'srv', durationMinutes: 30 }),
      resolveBookingMembership: jest.fn().mockResolvedValue({ id: 'm1', comercioId: 'c1' }),
      comercios: { getComercio: jest.fn().mockResolvedValue({ timezone: AR }) },
      resolvePersonId: jest.fn().mockResolvedValue('person-1'),
      availability: {
        blockingTimeOff: jest.fn((_m: string, start: Date) =>
          Promise.resolve(
            opts.blockedIso?.includes(start.toISOString())
              ? { type: TimeOffType.Holiday, reason: 'Navidad' }
              : null,
          ),
        ),
      },
      book,
      notifyBooked,
    });
    return { svc, book, notifyBooked };
  }

  const DTO = {
    personId: 'person-1',
    staffId: 'st1',
    serviceId: 'srv',
    startAt: '2026-12-01T21:00:00.000Z', // martes 18:00 en Argentina
    everyWeeks: 1,
    count: 4,
  };

  it('crea un turno por semana a la misma hora local, todos en la misma serie', async () => {
    const { svc, book } = setup();
    const res = await svc.bookSeries('p1', DTO);
    expect(res.created).toHaveLength(4);
    expect(res.skipped).toEqual([]);
    expect(book.mock.calls.map((c) => (c[1] as { startAt: string }).startAt)).toEqual([
      '2026-12-01T21:00:00.000Z',
      '2026-12-08T21:00:00.000Z',
      '2026-12-15T21:00:00.000Z',
      '2026-12-22T21:00:00.000Z',
    ]);
    const seriesIds = new Set(book.mock.calls.map((c) => (c[4] as { seriesId: string }).seriesId));
    expect(seriesIds.size).toBe(1);
    expect(book.mock.calls.every((c) => (c[4] as { notify: boolean }).notify === false)).toBe(true);
  });

  it('cada 2 semanas salta de a 14 días', async () => {
    const { svc, book } = setup();
    await svc.bookSeries('p1', { ...DTO, everyWeeks: 2, count: 2 });
    expect((book.mock.calls[1][1] as { startAt: string }).startAt).toBe(
      '2026-12-15T21:00:00.000Z',
    );
  });

  it('saltea feriados y horarios ocupados, con el motivo', async () => {
    const { svc } = setup({
      blockedIso: ['2026-12-08T21:00:00.000Z'],
      conflictIso: ['2026-12-15T21:00:00.000Z'],
    });
    const res = await svc.bookSeries('p1', DTO);
    expect(res.created).toHaveLength(2);
    expect(res.skipped).toEqual([
      { startAt: '2026-12-08T21:00:00.000Z', reason: 'Feriado: Navidad' },
      { startAt: '2026-12-15T21:00:00.000Z', reason: 'Ya tenés otro turno a esa hora' },
    ]);
  });

  it('un solo email al cliente con todas las fechas; el resto solo recordatorio', async () => {
    const { svc, notifyBooked } = setup();
    await svc.bookSeries('p1', { ...DTO, count: 3 });
    expect(notifyBooked).toHaveBeenCalledTimes(3);
    expect(notifyBooked.mock.calls[0][3].seriesDates).toHaveLength(3);
    expect(notifyBooked.mock.calls[1][3]).toEqual({ confirmation: false });
    expect(notifyBooked.mock.calls[2][3]).toEqual({ confirmation: false });
  });

  it('si no se pudo dar ninguna fecha, error con el motivo', async () => {
    const { svc } = setup({
      conflictIso: ['2026-12-01T21:00:00.000Z', '2026-12-08T21:00:00.000Z'],
    });
    await expect(svc.bookSeries('p1', { ...DTO, count: 2 })).rejects.toThrow(
      'No se pudo dar ningún turno: Ya tenés otro turno a esa hora',
    );
  });
});

describe('AppointmentsService.reschedule — cambio de horario desde el panel', () => {
  const START = new Date(Date.now() + 2 * 86_400_000);
  const NEW_START = new Date(START.getTime() + 3 * 3_600_000);

  function setup(opts: { status?: AppointmentStatus; checkedInAt?: Date; busy?: boolean } = {}) {
    const svc = Object.create(AppointmentsService.prototype) as AppointmentsService;
    const appt = {
      id: 'a1',
      professionalId: 'p1',
      comercioId: 'c1',
      membershipId: 'm1',
      staffId: 'st1',
      personId: 'person-1',
      serviceId: 'srv',
      status: opts.status ?? AppointmentStatus.Confirmed,
      checkedInAt: opts.checkedInAt ?? null,
      startAt: START,
      endAt: new Date(START.getTime() + 45 * 60_000),
    };
    const save = jest.fn((a: unknown) => Promise.resolve(a));
    const notifyBooked = jest.fn().mockResolvedValue(undefined);
    const notifyFreedSlot = jest.fn().mockResolvedValue(undefined);
    Object.assign(svc, {
      findById: jest.fn().mockResolvedValue(appt),
      services: { findOne: jest.fn().mockResolvedValue({ id: 'srv', capacity: 1 }) },
      overlapping: jest
        .fn()
        .mockResolvedValue(opts.busy ? [appt, { id: 'other', serviceId: 'otro' }] : [appt]),
      pendingHolds: jest.fn().mockResolvedValue([]),
      appointments: { save },
      waitlist: { notifyFreedSlot },
      professionals: { findOne: jest.fn().mockResolvedValue({ timezone: AR }) },
      notifyBooked,
      emitWaitingRoom: jest.fn().mockResolvedValue(undefined),
    });
    return { svc, appt, save, notifyBooked, notifyFreedSlot };
  }

  it('mueve el turno manteniendo la duración y avisa al cliente del cambio', async () => {
    const { svc, notifyBooked, notifyFreedSlot } = setup();
    const res = await svc.reschedule('p1', 'a1', { startAt: NEW_START.toISOString() });
    expect(res.startAt).toEqual(NEW_START);
    expect(res.endAt.getTime() - res.startAt.getTime()).toBe(45 * 60_000);
    expect(notifyFreedSlot).toHaveBeenCalledWith(expect.objectContaining({ startAt: START }));
    expect(notifyBooked.mock.calls[0][3].previousWhenText).toEqual(expect.any(String));
  });

  it('sin avisar al cliente: solo reprograma el recordatorio', async () => {
    const { svc, notifyBooked } = setup();
    await svc.reschedule('p1', 'a1', { startAt: NEW_START.toISOString(), notifyClient: false });
    expect(notifyBooked.mock.calls[0][3]).toEqual({ confirmation: false });
  });

  it('no lo pisa sobre otro turno', async () => {
    const { svc, save } = setup({ busy: true });
    await expect(
      svc.reschedule('p1', 'a1', { startAt: NEW_START.toISOString() }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(save).not.toHaveBeenCalled();
  });

  it('no mueve un turno que ya llegó o terminó', async () => {
    const llegó = setup({ checkedInAt: new Date() });
    await expect(
      llegó.svc.reschedule('p1', 'a1', { startAt: NEW_START.toISOString() }),
    ).rejects.toBeInstanceOf(BadRequestException);
    const terminado = setup({ status: AppointmentStatus.Done });
    await expect(
      terminado.svc.reschedule('p1', 'a1', { startAt: NEW_START.toISOString() }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('no lo pasa a un horario que ya pasó', async () => {
    const { svc } = setup();
    await expect(
      svc.reschedule('p1', 'a1', { startAt: new Date(Date.now() - 60_000).toISOString() }),
    ).rejects.toThrow('ya pasó');
  });
});
