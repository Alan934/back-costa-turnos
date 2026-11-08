import { BadRequestException } from '@nestjs/common';
import { AppointmentStatus } from '@/common/enums';
import { AppointmentsService } from './appointments.service';

/**
 * El número de turno de quien espera es su lugar en la fila (1..n). Al reordenar ("mandar atrás",
 * subir/bajar, urgente) o al avanzar la fila, los números siguen al lugar.
 */
describe('AppointmentsService — numeración de la fila', () => {
  type Row = {
    id: string;
    ticketNumber: number | null;
    queueRank: number;
    isPriority: boolean;
    [k: string]: unknown;
  };

  /**
   * `numbers` son los números de turno en el orden actual de la fila (a1 el primero…). Las filas
   * son las mismas instancias en todo el flujo y `orderedQueueOf` las reordena como lo haría la
   * base (prioridad, luego rango), así se ve el resultado real de renumerar.
   */
  function setup(numbers: number[]) {
    const rows: Row[] = numbers.map((n, i) => ({
      id: `a${i + 1}`,
      ticketNumber: n,
      queueRank: (i + 1) * 1000,
      isPriority: false,
      status: AppointmentStatus.Confirmed,
      checkedInAt: new Date(2026, 0, 1, 10, i),
      professionalId: 'p1',
      staffId: 's1',
      comercioId: 'c1',
    }));
    const byOrder = (x: Row, y: Row) =>
      x.isPriority === y.isPriority ? x.queueRank - y.queueRank : x.isPriority ? -1 : 1;

    const repo = {
      findOne: jest
        .fn()
        .mockImplementation(({ where }: { where: { id: string } }) =>
          Promise.resolve(rows.find((r) => r.id === where.id) ?? null),
        ),
      save: jest.fn().mockImplementation((x: unknown) => Promise.resolve(x)),
    };
    const manager = {
      query: jest.fn().mockResolvedValue(undefined),
      getRepository: jest.fn().mockReturnValue(repo),
    };
    const svc = Object.create(AppointmentsService.prototype) as AppointmentsService;
    Object.assign(svc, {
      appointments: { manager: { transaction: (cb: (m: unknown) => unknown) => cb(manager) } },
      findById: jest
        .fn()
        .mockImplementation((_t: string, id: string) =>
          Promise.resolve(rows.find((r) => r.id === id)),
        ),
      // Como la consulta real: solo confirmados.
      orderedQueueOf: jest
        .fn()
        .mockImplementation(() =>
          Promise.resolve(
            rows.filter((r) => r.status === AppointmentStatus.Confirmed).sort(byOrder),
          ),
        ),
      emitWaitingRoom: jest.fn().mockResolvedValue(undefined),
    });

    /** Número de cada uno, en el orden en que quedó la fila. */
    const state = () =>
      Object.fromEntries([...rows].sort(byOrder).map((r) => [r.id, r.ticketNumber]));
    /** Orden de la fila (ids). */
    const order = () =>
      [...rows]
        .sort(byOrder)
        .map((r) => r.id)
        .join(',');
    return { svc, rows, state, order };
  }

  describe('sendToBack', () => {
    it('al final: los de atrás suben un número y él toma el último (Alan #2, Ramon #3, Test #4)', async () => {
      const { svc, state, order } = setup([1, 2, 3, 4]); // a2 = Alan, a3 = Ramon, a4 = Test
      await svc.sendToBack('p1', 'a2', 'end');
      expect(order()).toBe('a1,a3,a4,a2');
      expect(state()).toEqual({ a1: 1, a3: 2, a4: 3, a2: 4 });
    });

    it('un lugar atrás: Alan #2 cede el paso a Ramon #3 y quedan Ramon #2, Alan #3, Test #4', async () => {
      const { svc, state, order } = setup([1, 2, 3, 4]);
      await svc.sendToBack('p1', 'a2', 'next');
      expect(order()).toBe('a1,a3,a2,a4');
      expect(state()).toEqual({ a1: 1, a3: 2, a2: 3, a4: 4 });
    });

    it('por defecto es al final', async () => {
      const { svc, order } = setup([1, 2, 3]);
      await svc.sendToBack('p1', 'a1');
      expect(order()).toBe('a2,a3,a1');
    });

    it('no toca el número de quienes estaban adelante', async () => {
      const { svc, state } = setup([1, 2, 3]);
      await svc.sendToBack('p1', 'a2', 'end');
      expect(state().a1).toBe(1);
    });

    it('si ya era el último, un lugar atrás es quedarse', async () => {
      const { svc, state, order } = setup([1, 2, 3]);
      await svc.sendToBack('p1', 'a3', 'next');
      expect(order()).toBe('a1,a2,a3');
      expect(state()).toEqual({ a1: 1, a2: 2, a3: 3 });
    });

    it('limpia el llamado: vuelve a recibir los avisos', async () => {
      const { svc, rows } = setup([1, 2]);
      Object.assign(rows[0], { calledAt: new Date(), awayUntil: new Date() });
      await svc.sendToBack('p1', 'a1', 'next');
      expect(rows[0].calledAt).toBeNull();
      expect(rows[0].awayUntil).toBeNull();
    });

    it('un urgente que cede el paso a un no urgente pierde la urgencia', async () => {
      const { svc, rows, order } = setup([1, 2]);
      rows[0].isPriority = true;
      await svc.sendToBack('p1', 'a1', 'next');
      expect(rows[0].isPriority).toBe(false);
      expect(order()).toBe('a2,a1');
    });

    it('solo se manda atrás a quien está en la fila', async () => {
      const { svc, rows } = setup([1, 2]);
      rows[0].status = AppointmentStatus.InProgress;
      await expect(svc.sendToBack('p1', 'a1', 'end')).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('moveInQueue', () => {
    it('al bajar un lugar también se intercambian los números', async () => {
      const { svc, state } = setup([1, 2, 3]);
      await svc.moveInQueue('p1', 'a2', 'down');
      expect(state()).toEqual({ a1: 1, a3: 2, a2: 3 });
    });

    it('en el borde no cambia nada', async () => {
      const { svc, state } = setup([1, 2]);
      await svc.moveInQueue('p1', 'a1', 'up');
      expect(state()).toEqual({ a1: 1, a2: 2 });
    });
  });

  describe('renumberQueueOf', () => {
    it('al salir el primero de la fila, los de atrás corren un número (Alan #2 pasa a #1)', async () => {
      // El #1 ya pasó a atención: la fila que queda es Alan #2, Ramon #3.
      const { svc, state } = setup([2, 3]);
      await (svc as unknown as { renumberQueueOf: (r: unknown) => Promise<void> }).renumberQueueOf({
        staffId: 's1',
      });
      expect(state()).toEqual({ a1: 1, a2: 2 });
    });

    it('no toca a quien está en atención: conserva su número', async () => {
      const { svc, rows } = setup([7, 2, 3]);
      rows[0].status = AppointmentStatus.InProgress; // a1 pasó a atención con el #7
      await (svc as unknown as { renumberQueueOf: (r: unknown) => Promise<void> }).renumberQueueOf({
        staffId: 's1',
      });
      expect(rows[0].ticketNumber).toBe(7);
      expect([rows[1].ticketNumber, rows[2].ticketNumber]).toEqual([1, 2]);
    });
  });
});
