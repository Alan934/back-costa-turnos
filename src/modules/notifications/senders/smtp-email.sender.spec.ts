import { NotificationChannel, NotificationType } from '@/common/enums';
import { SmtpEmailSender } from './smtp-email.sender';

/** Textos de los emails al cliente cuando el profesional mueve un turno o da turnos fijos. */
describe('SmtpEmailSender — turno cambiado y turnos fijos', () => {
  const config = {
    getOrThrow: (key: string) =>
      key === 'mail'
        ? { host: 'localhost', port: 587, user: 'u', password: 'p', from: 'no-reply@test' }
        : { frontUrl: 'https://app.test/' },
  };
  const sender = new SmtpEmailSender(config as never);
  const render = (payload: Record<string, unknown>) =>
    (
      sender as unknown as {
        render: (n: unknown) => { subject: string; text: string };
      }
    ).render({
      type: NotificationType.Booked,
      channel: NotificationChannel.Email,
      to: 'cliente@test',
      payload,
    });

  const base = {
    whenText: 'miércoles, 18 de noviembre a las 15:00',
    serviceName: 'Corte',
    placeName: 'Barbería Sur',
    manageToken: 'tok',
  };

  it('turno cambiado: dice antes y ahora', () => {
    const { subject, text } = render({
      ...base,
      previousWhenText: 'martes, 17 de noviembre a las 17:00',
    });
    expect(subject).toBe('Cambió el horario de tu turno: miércoles, 18 de noviembre a las 15:00');
    expect(text).toContain('Barbería Sur cambió el horario de tu turno.');
    expect(text).toContain('Antes: martes, 17 de noviembre a las 17:00');
    expect(text).toContain('Ahora: miércoles, 18 de noviembre a las 15:00');
    expect(text).toContain('https://app.test/turno/tok');
  });

  it('turnos fijos: lista todas las fechas en un solo email', () => {
    const { subject, text } = render({
      ...base,
      seriesDates: ['martes, 17 de noviembre a las 17:00', 'martes, 24 de noviembre a las 17:00'],
    });
    expect(subject).toBe('Tus turnos fijos en Barbería Sur');
    expect(text).toContain('Te reservamos 2 turnos:');
    expect(text).toContain('• martes, 24 de noviembre a las 17:00');
    expect(text).not.toContain('Cuándo:');
  });

  it('recordatorio con pedido de confirmación: links para confirmar o liberar', () => {
    const { subject, text } = (
      sender as unknown as { render: (n: unknown) => { subject: string; text: string } }
    ).render({
      type: NotificationType.Reminder,
      channel: NotificationChannel.Email,
      to: 'cliente@test',
      payload: { ...base, askConfirmation: true },
    });
    expect(subject).toBe(
      '¿Venís? Confirmá tu turno del miércoles, 18 de noviembre a las 15:00',
    );
    expect(text).toContain('https://app.test/turno/tok?r=si');
    expect(text).toContain('https://app.test/turno/tok?r=no');
  });

  it('recordatorio sin pedido de confirmación: el de siempre', () => {
    const { subject, text } = (
      sender as unknown as { render: (n: unknown) => { subject: string; text: string } }
    ).render({
      type: NotificationType.Reminder,
      channel: NotificationChannel.Email,
      to: 'cliente@test',
      payload: base,
    });
    expect(subject).toBe('Recordatorio: tu turno es el miércoles, 18 de noviembre a las 15:00');
    expect(text).not.toContain('?r=si');
  });

  it('un turno común sigue siendo la confirmación de siempre', () => {
    expect(render(base).subject).toBe(
      'Turno confirmado: miércoles, 18 de noviembre a las 15:00',
    );
  });
});
