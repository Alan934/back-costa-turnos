import { BadRequestException } from '@nestjs/common';
import { FindOperator } from 'typeorm';
import { AppointmentsService } from './appointments.service';

/**
 * El listado de la agenda siempre se acota por inicio del turno. Antes ignoraba `from`/`to` y,
 * con orden ascendente y tope de filas, devolvía los turnos más viejos: la agenda de hoy salía
 * vacía en cuanto el historial pasaba el tope.
 */
describe('AppointmentsService.list — rango de fechas', () => {
  function setup() {
    const find = jest.fn().mockResolvedValue([]);
    const svc = Object.create(AppointmentsService.prototype) as AppointmentsService;
    Object.assign(svc, { appointments: { find } });
    return { svc, find };
  }

  type StartAtOp = FindOperator<Date> & { type: string; value: Date | Date[] };
  const startAtOf = (find: jest.Mock) =>
    (find.mock.calls[0][0] as { where: { startAt: StartAtOp } }).where.startAt;

  it('con from y to filtra startAt entre ambos (y por tenant/staff)', async () => {
    const { svc, find } = setup();
    await svc.list('p1', {
      staffId: 's1',
      from: '2026-11-15T03:00:00.000Z',
      to: '2026-11-16T02:59:59.999Z',
    });
    const args = find.mock.calls[0][0] as { where: Record<string, unknown>; order: unknown };
    expect(args.where.professionalId).toBe('p1');
    expect(args.where.staffId).toBe('s1');
    expect(args.order).toEqual({ startAt: 'ASC' });
    const op = startAtOf(find);
    expect(op.type).toBe('between');
    expect(op.value).toEqual([
      new Date('2026-11-15T03:00:00.000Z'),
      new Date('2026-11-16T02:59:59.999Z'),
    ]);
  });

  it('sin rango arranca desde hace 24 h, nunca desde el principio del historial', async () => {
    const { svc, find } = setup();
    const before = Date.now();
    await svc.list('p1');
    const op = startAtOf(find);
    expect(op.type).toBe('moreThanOrEqual');
    const from = (op.value as Date).getTime();
    expect(from).toBeGreaterThanOrEqual(before - 86_400_000 - 1000);
    expect(from).toBeLessThanOrEqual(Date.now() - 86_400_000 + 1000);
  });

  it('rechaza un rango invertido', async () => {
    const { svc, find } = setup();
    await expect(
      svc.list('p1', { from: '2026-11-16T00:00:00Z', to: '2026-11-15T00:00:00Z' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(find).not.toHaveBeenCalled();
  });

  it('rechaza un rango de más de 100 días', async () => {
    const { svc } = setup();
    await expect(
      svc.list('p1', { from: '2026-01-01T00:00:00Z', to: '2026-06-01T00:00:00Z' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
