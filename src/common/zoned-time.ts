import { BadRequestException } from '@nestjs/common';

/** Zona por defecto cuando la guardada en el perfil es inválida. */
export const DEFAULT_TIME_ZONE = 'America/Argentina/Buenos_Aires';

/**
 * Instante (UTC) en que empieza el día 'YYYY-MM-DD' en una zona horaria IANA. Se calcula el
 * desfase de la zona a esa fecha con Intl (sin librerías): mediodía UTC cae en el mismo día
 * calendario en cualquier zona de América, así que sirve de referencia estable.
 */
export function zonedDayStart(date: string, timezone: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new BadRequestException('Fecha inválida');
  const utcMidnight = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(utcMidnight.getTime())) throw new BadRequestException('Fecha inválida');
  const offsetMs = (tz: string): number => {
    const ref = new Date(utcMidnight.getTime() + 12 * 3_600_000);
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).formatToParts(ref);
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
    const asUtc = Date.UTC(
      get('year'),
      get('month') - 1,
      get('day'),
      get('hour'),
      get('minute'),
      get('second'),
    );
    return asUtc - ref.getTime(); // cuánto adelanta (o atrasa) la zona respecto de UTC
  };
  let offset: number;
  try {
    offset = offsetMs(timezone);
  } catch {
    offset = offsetMs('America/Argentina/Buenos_Aires'); // zona inválida guardada en el perfil
  }
  return new Date(utcMidnight.getTime() - offset);
}

/** Partes de una fecha vistas en una zona horaria (con fallback si la zona es inválida). */
function zonedParts(date: Date, timezone: string): Record<string, number> {
  const read = (timeZone: string) =>
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
    })
      .formatToParts(date)
      .reduce<Record<string, number>>((acc, p) => {
        if (p.type !== 'literal') acc[p.type] = Number(p.value);
        return acc;
      }, {});
  try {
    return read(timezone);
  } catch {
    return read(DEFAULT_TIME_ZONE);
  }
}

/** Hora local (0–23) de `date` en la zona dada. */
export function zonedHour(date: Date, timezone: string): number {
  return zonedParts(date, timezone).hour;
}

/** Día local 'YYYY-MM-DD' de `date` en la zona dada. */
export function zonedDate(date: Date, timezone: string): string {
  const p = zonedParts(date, timezone);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}
