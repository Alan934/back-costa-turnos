import { BadRequestException, ConflictException } from '@nestjs/common';
import { AppointmentStatus, CancellationReason } from '@/common/enums';
import { MeService } from './me.service';

/**
 * Confirmación del día anterior por link personal: "Confirmo" deja la marca y "No puedo ir"
 * libera el horario. Repositorios y avisos se reemplazan por dobles.
 */
describe('MeService — confirmar / no puedo ir', () => {
  const TOKEN = 'a'.repeat(32);

  function setup(opts: { askConfirmation: boolean; hoursAhead: number; status?: AppointmentStatus }) {
    const svc = Object.create(MeService.prototype) as MeService;
    const appt = {
      id: 'a1',
      professionalId: 'p1',
      comercioId: 'c1',
      membershipId: 'm1',
      staffId: 'st1',
      personId: 'person-1',
      serviceId: 'srv',
      status: opts.status ?? AppointmentStatus.Confirmed,
      startAt: new Date(Date.now() + opts.hoursAhead * 3_600_000),
      endAt: new Date(Date.now() + (opts.hoursAhead + 1) * 3_600_000),
      clientConfirmedAt: null as Date | null,
      cancellationReason: null as CancellationReason | null,
    };
    const save = jest.fn((a: unknown) => Promise.resolve(a));
    const notifyFreedSlot = jest.fn().mockResolvedValue(undefined);
    Object.assign(svc, {
      appointments: { findOne: jest.fn().mockResolvedValue(appt), save },
      professionals: {
        findOne: jest.fn().mockResolvedValue({
          id: 'p1',
          cancellationWindowHours: 24,
          askConfirmation: opts.askConfirmation,
        }),
      },
      persons: { findOne: jest.fn().mockResolvedValue({ fullName: 'Ana' }) },
      waitlist: { notifyFreedSlot },
      notifications: { notifyProfessional: jest.fn().mockResolvedValue(undefined) },
      loadRefs: jest.fn().mockResolvedValue({
        services: new Map(),
        staff: new Map(),
        professionals: new Map(),
      }),
      toDto: jest.fn((a: typeof appt) => a),
    });
    return { svc, appt, save, notifyFreedSlot };
  }

  it('confirmo: deja la marca, una sola vez', async () => {
    const { svc, appt, save } = setup({ askConfirmation: true, hoursAhead: 20 });
    await svc.confirmByManageToken(TOKEN);
    const first = appt.clientConfirmedAt;
    expect(first).toBeInstanceOf(Date);
    await svc.confirmByManageToken(TOKEN);
    expect(appt.clientConfirmedAt).toBe(first);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('no se confirma un turno cancelado', async () => {
    const { svc } = setup({
      askConfirmation: true,
      hoursAhead: 20,
      status: AppointmentStatus.Cancelled,
    });
    await expect(svc.confirmByManageToken(TOKEN)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('no puedo ir (pide confirmación): libera el horario aunque falten menos de 24 h', async () => {
    const { svc, appt, notifyFreedSlot } = setup({ askConfirmation: true, hoursAhead: 20 });
    await svc.declineByManageToken(TOKEN);
    expect(appt.status).toBe(AppointmentStatus.Cancelled);
    expect(appt.cancellationReason).toBe(CancellationReason.Client);
    expect(notifyFreedSlot).toHaveBeenCalled();
  });

  it('sin pedido de confirmación rige la ventana de cancelación de siempre', async () => {
    const { svc, appt } = setup({ askConfirmation: false, hoursAhead: 20 });
    await expect(svc.declineByManageToken(TOKEN)).rejects.toBeInstanceOf(ConflictException);
    expect(appt.status).toBe(AppointmentStatus.Confirmed);
  });
});
