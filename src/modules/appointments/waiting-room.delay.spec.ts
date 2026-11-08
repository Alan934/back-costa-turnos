import { AppointmentStatus, CreatedVia } from '@/common/enums';
import { computeDelayMinutes } from './waiting-room.delay';

const MIN = 60_000;
const NOW = new Date(2026, 0, 1, 12, 0, 0).getTime();
const ago = (minutes: number) => new Date(NOW - minutes * MIN);
const ahead = (minutes: number) => new Date(NOW + minutes * MIN);

type Row = Parameters<typeof computeDelayMinutes>[0][number];
const row = (over: Partial<Row>): Row => ({
  status: AppointmentStatus.Confirmed,
  createdVia: CreatedVia.WalkIn,
  startAt: ago(0),
  checkedInAt: ago(0),
  actualStartAt: null,
  awayUntil: null,
  ...over,
});

const thirty = () => 30;

describe('computeDelayMinutes — cuánto va atrasado el profesional', () => {
  it('sin nadie, está al día', () => {
    expect(computeDelayMinutes([], NOW, thirty)).toBe(0);
  });

  it('gente de paso esperando (sin turno) no es atraso', () => {
    const queue = [row({ checkedInAt: ago(50) }), row({ checkedInAt: ago(40) })];
    expect(computeDelayMinutes(queue, NOW, thirty)).toBe(0);
  });

  it('la atención en curso dentro de lo estimado: al día', () => {
    const serving = row({ status: AppointmentStatus.InProgress, actualStartAt: ago(20) });
    expect(computeDelayMinutes([serving], NOW, thirty)).toBe(0);
  });

  it('la atención en curso se pasó de lo estimado: atraso = lo que se pasó', () => {
    // Empezó hace 42 min y se estimaban 30: se pasó 12.
    const serving = row({ status: AppointmentStatus.InProgress, actualStartAt: ago(42) });
    expect(computeDelayMinutes([serving], NOW, thirty)).toBe(12);
  });

  it('usa la duración estimada de cada uno (45 min configurados: a los 42 aún no se pasó)', () => {
    const serving = row({ status: AppointmentStatus.InProgress, actualStartAt: ago(42) });
    expect(computeDelayMinutes([serving], NOW, () => 45)).toBe(0);
  });

  it('un turno agendado que llegó a tiempo y sigue esperando pasada su hora', () => {
    const scheduled = row({
      createdVia: CreatedVia.Professional,
      startAt: ago(15),
      checkedInAt: ago(25),
    });
    expect(computeDelayMinutes([scheduled], NOW, thirty)).toBe(15);
  });

  it('un turno agendado que llegó tarde: cuenta desde que llegó, no desde su hora', () => {
    const scheduled = row({
      createdVia: CreatedVia.Professional,
      startAt: ago(30),
      checkedInAt: ago(5),
    });
    expect(computeDelayMinutes([scheduled], NOW, thirty)).toBe(5);
  });

  it('un turno agendado que llegó antes de su hora: todavía no hay atraso', () => {
    const scheduled = row({
      createdVia: CreatedVia.Professional,
      startAt: ahead(10),
      checkedInAt: ago(5),
    });
    expect(computeDelayMinutes([scheduled], NOW, thirty)).toBe(0);
  });

  it('quien está ausente no cuenta', () => {
    const away = row({
      createdVia: CreatedVia.Professional,
      startAt: ago(20),
      checkedInAt: ago(25),
      awayUntil: ahead(5),
    });
    expect(computeDelayMinutes([away], NOW, thirty)).toBe(0);
  });

  it('con las dos situaciones, el atraso es el mayor', () => {
    const serving = row({ status: AppointmentStatus.InProgress, actualStartAt: ago(42) }); // 12
    const scheduled = row({
      createdVia: CreatedVia.Professional,
      startAt: ago(20),
      checkedInAt: ago(25),
    }); // 20
    expect(computeDelayMinutes([serving, scheduled], NOW, thirty)).toBe(20);
  });
});
