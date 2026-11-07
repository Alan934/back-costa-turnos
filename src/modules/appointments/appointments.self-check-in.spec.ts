import { BadRequestException } from '@nestjs/common';
import { WaitingRoomStatus } from '@/common/enums';
import { AppointmentsService } from './appointments.service';

/**
 * Self check-in sin servicio: el profesional decide (por membresía) si el cliente elige el
 * servicio al anotarse. Por defecto no; con un único servicio activo se asigna directo.
 *
 * Se prueba solo la decisión del servicio: el resto de AppointmentsService (agenda, pagos,
 * push) se reemplaza por dobles, igual que el constructor real no se arma acá.
 */
describe('AppointmentsService.selfCheckIn — servicio opcional', () => {
  const PERSON = { fullName: 'Juan García', phone: '2612465120' };

  function setup(opts: { askService: boolean; services: string[] }) {
    const svc = Object.create(AppointmentsService.prototype) as AppointmentsService;
    const createWalkIn = jest
      .fn()
      .mockResolvedValue({ publicToken: 'tok', ticketNumber: 3, status: 'requested' });
    Object.assign(svc, {
      catalog: {
        listActiveByMembership: jest.fn().mockResolvedValue(opts.services.map((id) => ({ id }))),
      },
      availability: {
        getWalkInSchedule: jest.fn().mockResolvedValue({ hasSchedule: false, openNow: true }),
      },
      staff: { findOne: jest.fn().mockResolvedValue({ id: 'staff-1' }) },
      notifyProfessionalOfSelfCheckIn: jest.fn().mockResolvedValue(undefined),
      createWalkIn,
    });
    const membership = {
      id: 'm1',
      professionalId: 'p1',
      waitingRoomEnabled: true,
      waitingRoomSelfCheckIn: true,
      waitingRoomAskService: opts.askService,
      waitingRoomStatus: WaitingRoomStatus.Open,
    };
    return { svc, createWalkIn, membership };
  }

  const serviceIdPassed = (createWalkIn: jest.Mock) => createWalkIn.mock.calls[0][2].serviceId;

  it('por defecto (no pregunta) con varios servicios: se anota sin servicio', async () => {
    const { svc, createWalkIn, membership } = setup({ askService: false, services: ['a', 'b'] });
    await svc.selfCheckIn(membership as never, PERSON);
    expect(serviceIdPassed(createWalkIn)).toBeUndefined();
  });

  it('por defecto con un único servicio: se asigna ese', async () => {
    const { svc, createWalkIn, membership } = setup({ askService: false, services: ['a'] });
    await svc.selfCheckIn(membership as never, PERSON);
    expect(serviceIdPassed(createWalkIn)).toBe('a');
  });

  it('pregunta + varios servicios + sin elegir: error', async () => {
    const { svc, createWalkIn, membership } = setup({ askService: true, services: ['a', 'b'] });
    await expect(svc.selfCheckIn(membership as never, PERSON)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(createWalkIn).not.toHaveBeenCalled();
  });

  it('pregunta + eligió: usa el elegido', async () => {
    const { svc, createWalkIn, membership } = setup({ askService: true, services: ['a', 'b'] });
    await svc.selfCheckIn(membership as never, { ...PERSON, serviceId: 'b' });
    expect(serviceIdPassed(createWalkIn)).toBe('b');
  });

  it('pregunta + un único servicio: no hace falta elegir', async () => {
    const { svc, createWalkIn, membership } = setup({ askService: true, services: ['a'] });
    await svc.selfCheckIn(membership as never, PERSON);
    expect(serviceIdPassed(createWalkIn)).toBe('a');
  });
});
