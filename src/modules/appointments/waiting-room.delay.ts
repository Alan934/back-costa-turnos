import { AppointmentStatus, CreatedVia } from '@/common/enums';
import type { Appointment } from './entities/appointment.entity';

type DelayInput = Pick<
  Appointment,
  'status' | 'createdVia' | 'startAt' | 'checkedInAt' | 'actualStartAt' | 'awayUntil'
>;

/**
 * Cuántos minutos va atrasado el profesional (0 = al día).
 *
 * Es el MAYOR de dos atrasos, porque son dos formas distintas de ir tarde:
 *  - la atención en curso se pasó de su duración estimada (`durationOf`);
 *  - un turno agendado que ya llegó espera pasada su hora: se cuenta desde la hora del turno, o
 *    desde que llegó si llegó tarde (no es atraso del profesional que alguien llegue después).
 *
 * Quien está ausente ("me voy y vuelvo") no cuenta: no está esperando en este momento.
 */
export function computeDelayMinutes<T extends DelayInput>(
  appts: T[],
  now: number,
  durationOf: (a: T) => number,
): number {
  let delayMs = 0;

  const inProgress = appts.find((a) => a.status === AppointmentStatus.InProgress);
  if (inProgress?.actualStartAt) {
    const expectedEnd = inProgress.actualStartAt.getTime() + durationOf(inProgress) * 60_000;
    delayMs = Math.max(delayMs, now - expectedEnd);
  }

  for (const a of appts) {
    if (a.status !== AppointmentStatus.Confirmed || !a.checkedInAt) continue;
    if (a.createdVia === CreatedVia.WalkIn) continue; // sin hora de turno no hay "tarde"
    if (a.awayUntil && a.awayUntil.getTime() > now) continue;
    const since = Math.max(a.startAt.getTime(), a.checkedInAt.getTime());
    delayMs = Math.max(delayMs, now - since);
  }

  return Math.max(0, Math.round(delayMs / 60_000));
}
