import { BadRequestException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { CatalogService } from './catalog.service';
import { Service } from './entities/service.entity';
import { ServiceMembership } from './entities/service-membership.entity';
import { ComerciosService } from '@/modules/comercios/comercios.service';
import { FilesService } from '@/modules/files/files.service';

describe('CatalogService (opciones de pago)', () => {
  let service: CatalogService;
  let repo: { create: jest.Mock; save: jest.Mock; findOne: jest.Mock };
  let serviceMemberships: { create: jest.Mock; save: jest.Mock; find: jest.Mock };
  let comercios: {
    getMembershipById: jest.Mock;
    getActiveMembershipsInComercio: jest.Mock;
  };

  const MEMBERSHIP_ID = 'membership-1';
  const COMERCIO_ID = 'com-1';
  let savedService: Record<string, unknown>;
  let mpConnected: boolean;

  beforeEach(() => {
    mpConnected = true;
    savedService = {};
    repo = {
      create: jest.fn((x: Record<string, unknown>) => x),
      save: jest.fn((x: Record<string, unknown>) => {
        savedService = { id: 'svc-1', ...x };
        return Promise.resolve(savedService);
      }),
      // getForComercio (lo llama createForComercio al final) relee el servicio.
      findOne: jest.fn(() => Promise.resolve(savedService)),
    };
    serviceMemberships = {
      create: jest.fn((x: unknown) => x),
      save: jest.fn((x: unknown) => Promise.resolve(x)),
      // attachAssigned: sin filas => assignedMemberships vacío (no relevante para estos tests).
      find: jest.fn(() => Promise.resolve([])),
    };
    comercios = {
      getMembershipById: jest.fn(() =>
        Promise.resolve({ id: MEMBERSHIP_ID, professionalId: 'pro-1', comercioId: COMERCIO_ID }),
      ),
      getActiveMembershipsInComercio: jest.fn(() =>
        Promise.resolve([
          {
            id: MEMBERSHIP_ID,
            professionalId: 'pro-1',
            comercioId: COMERCIO_ID,
            professional: { mpConnectedAt: mpConnected ? new Date() : null },
          },
        ]),
      ),
    };
    const files = {
      removeByKeys: jest.fn(() => Promise.resolve()),
      getSignedUrlsForKeys: jest.fn(() => Promise.resolve([])),
    };
    service = new CatalogService(
      repo as unknown as Repository<Service>,
      serviceMemberships as unknown as Repository<ServiceMembership>,
      comercios as unknown as ComerciosService,
      files as unknown as FilesService,
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
    expect(result.comercioId).toBe(COMERCIO_ID);
    expect(repo.save).toHaveBeenCalled();
    expect(serviceMemberships.save).toHaveBeenCalled();
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

  it('rechaza seña/pago completo si algún profesional asignado no tiene MP conectado', async () => {
    mpConnected = false;
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
    mpConnected = false;
    const result = await service.createForMembership(MEMBERSHIP_ID, {
      name: 'Corte',
      durationMinutes: 30,
      priceCents: 50000,
    });
    expect(result.allowNoPayment).toBe(true);
  });
});
