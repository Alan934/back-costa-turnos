import { DateTime } from 'luxon';
import { MetricsRange } from './dto/metrics.dto';

/**
 * Períodos de calendario que comparten Métricas y Cierre de caja, para que "Semana" y
 * "Mes" signifiquen lo mismo en las dos pantallas: la semana va de lunes a domingo y el
 * mes del 1 al último día, siempre en la zona horaria del profesional.
 */
export interface Period {
  /** Inicio del período (00:00 del primer día). */
  start: DateTime;
  /** Fin del período completo (23:59:59.999 del último día). */
  end: DateTime;
  /** Hasta dónde se mide: ahora en el período en curso, `end` en uno pasado. */
  until: DateTime;
  isCurrent: boolean;
}

const unit = (range: MetricsRange) => (range === MetricsRange.Month ? 'month' : 'week');

/** Período `offset` hacia atrás (0 = el actual). La semana de Luxon empieza el lunes. */
export function resolvePeriod(now: DateTime, range: MetricsRange, offset = 0): Period {
  const u = unit(range);
  const start = now.startOf(u).minus({ [`${u}s`]: offset });
  const end = start.endOf(u);
  const isCurrent = offset === 0;
  return { start, end, until: isCurrent ? now : end, isCurrent };
}

/**
 * El período anterior a `current`, recortado al mismo tramo transcurrido: si hoy es
 * miércoles a las 14h, se compara contra lunes–miércoles 14h de la semana pasada, no
 * contra la semana entera (si no, la semana en curso siempre "iría peor").
 */
export function previousPeriod(current: Period, range: MetricsRange): Period {
  const u = unit(range);
  const start = current.start.minus({ [`${u}s`]: 1 }).startOf(u);
  const end = start.endOf(u);
  if (!current.isCurrent) return { start, end, until: end, isCurrent: false };
  const elapsed = current.until.diff(current.start);
  const until = DateTime.min(start.plus(elapsed), end);
  return { start, end, until, isCurrent: false };
}
