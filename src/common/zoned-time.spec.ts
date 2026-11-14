import { zonedDate, zonedDayStart, zonedHour } from './zoned-time';

describe('zoned-time', () => {
  const AR = 'America/Argentina/Buenos_Aires'; // UTC-3, sin horario de verano

  it('calcula la medianoche local de un día', () => {
    expect(zonedDayStart('2026-11-21', AR).toISOString()).toBe('2026-11-21T03:00:00.000Z');
  });

  it('da la hora y el día locales', () => {
    const at = new Date('2026-11-21T10:00:00Z'); // 07:00 en Argentina
    expect(zonedHour(at, AR)).toBe(7);
    expect(zonedDate(at, AR)).toBe('2026-11-21');
  });

  it('cambia de día según la zona, no según UTC', () => {
    const at = new Date('2026-11-22T01:30:00Z'); // todavía 21 a las 22:30 en Argentina
    expect(zonedDate(at, AR)).toBe('2026-11-21');
    expect(zonedHour(at, AR)).toBe(22);
  });

  it('usa la zona por defecto si la guardada es inválida', () => {
    const at = new Date('2026-11-21T10:00:00Z');
    expect(zonedHour(at, 'Zona/Inexistente')).toBe(7);
  });
});
