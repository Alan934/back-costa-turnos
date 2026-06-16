import { BadRequestException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { CatalogService } from './catalog.service';
import { Service } from './entities/service.entity';
import { ComerciosService } from '@/modules/comercios/comercios.service';

describe('CatalogService (opciones de pago)', () => {
  let service: CatalogService;
  let repo: { create: jest.Mock; save: jest.Mock };
  let comercios: { getMembershipById: jest.Mock; hasMpConnected: jest.Mock };

  const MEMBERSHIP_ID = 'membership-1';

  beforeEach(() => {
    repo = {
      create: jest.fn((x: unknown) => x),
      save: jest.fn((x: unknown) => Promise.resolve(x)),
    };
    comercios = {
      getMembershipById: jest.fn(() =>
        Promise.resolve({ id: MEMBERSHIP_ID, professionalId: 'pro-1', comercioId: 'com-1' }),
      ),
      // Por defecto el profesional tiene MP conectado (las opciones pagas se permiten).
      hasMpConnected: jest.fn(() => Promise.resolve(true)),
    };
    service = new CatalogService(
      repo as unknown as Repository<Service>,
      comercios as unknown as ComerciosService,
    );
  });

  it('rechaza allowDeposit sin monto de seña', async () => {
    await expect(
      service.createForMembership(MEMBERSHIP_ID, {
        name: 'Color',
        durationMinutes: 60,
        priceCents: 100000,
        allowDeposit: true,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('acepta solo sin pago (default)', async () => {
    const result = await service.createForMembership(MEMBERSHIP_ID, {
      name: 'Corte',
      durationMinutes: 30,
      priceCents: 50000,
    });
    expect(result.name).toBe('Corte');
    expect(result.allowNoPayment).toBe(true);
    expect(result.membershipId).toBe(MEMBERSHIP_ID);
    expect(repo.save).toHaveBeenCalled();
  });

  it('acepta combinación seña + pago completo + sin pago', async () => {
    const result = await service.createForMembership(MEMBERSHIP_ID, {
      name: 'Corte premium',
      durationMinutes: 45,
      priceCents: 80000,
      allowDeposit: true,
      allowFullPayment: true,
      allowNoPayment: true,
      depositAmountCents: 20000,
    });
    expect(result.allowDeposit).toBe(true);
    expect(result.allowFullPayment).toBe(true);
    expect(result.depositAmountCents).toBe(20000);
  });

  it('rechaza si no habilita ninguna opción', async () => {
    await expect(
      service.createForMembership(MEMBERSHIP_ID, {
        name: 'Vacio',
        durationMinutes: 30,
        priceCents: 50000,
        allowNoPayment: false,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rechaza seña/pago completo si el profesional no tiene MP conectado', async () => {
    comercios.hasMpConnected.mockResolvedValue(false);
    await expect(
      service.createForMembership(MEMBERSHIP_ID, {
        name: 'Corte premium',
        durationMinutes: 45,
        priceCents: 80000,
        allowFullPayment: true,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('permite solo sin pago aunque no tenga MP conectado', async () => {
    comercios.hasMpConnected.mockResolvedValue(false);
    const result = await service.createForMembership(MEMBERSHIP_ID, {
      name: 'Corte',
      durationMinutes: 30,
      priceCents: 50000,
    });
    expect(result.allowNoPayment).toBe(true);
    expect(comercios.hasMpConnected).not.toHaveBeenCalled();
  });
});
