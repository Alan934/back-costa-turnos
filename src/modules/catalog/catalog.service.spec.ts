import { BadRequestException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { CatalogService } from './catalog.service';
import { Service } from './entities/service.entity';

describe('CatalogService (opciones de pago)', () => {
  let service: CatalogService;
  let repo: { create: jest.Mock; save: jest.Mock };

  beforeEach(() => {
    repo = {
      create: jest.fn((x: unknown) => x),
      save: jest.fn((x: unknown) => Promise.resolve(x)),
    };
    service = new CatalogService(repo as unknown as Repository<Service>);
  });

  it('rechaza allowDeposit sin monto de seña', () => {
    expect(() =>
      service.create('tenant-1', {
        name: 'Color',
        durationMinutes: 60,
        priceCents: 100000,
        allowDeposit: true,
      }),
    ).toThrow(BadRequestException);
  });

  it('acepta solo sin pago (default)', async () => {
    const result = await service.create('tenant-1', {
      name: 'Corte',
      durationMinutes: 30,
      priceCents: 50000,
    });
    expect(result.name).toBe('Corte');
    expect(result.allowNoPayment).toBe(true);
    expect(repo.save).toHaveBeenCalled();
  });

  it('acepta combinación seña + pago completo + sin pago', async () => {
    const result = await service.create('tenant-1', {
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

  it('rechaza si no habilita ninguna opción', () => {
    expect(() =>
      service.create('tenant-1', {
        name: 'Vacio',
        durationMinutes: 30,
        priceCents: 50000,
        allowNoPayment: false,
      }),
    ).toThrow(BadRequestException);
  });
});
