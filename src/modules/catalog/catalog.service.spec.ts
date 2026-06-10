import { BadRequestException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { CatalogService } from './catalog.service';
import { Service } from './entities/service.entity';
import { DepositMode } from '@/common/enums';

describe('CatalogService (deposit consistency)', () => {
  let service: CatalogService;
  let repo: { create: jest.Mock; save: jest.Mock };

  beforeEach(() => {
    repo = {
      create: jest.fn((x: unknown) => x),
      save: jest.fn((x: unknown) => Promise.resolve(x)),
    };
    service = new CatalogService(repo as unknown as Repository<Service>);
  });

  it('rechaza deposit_mode=required sin monto de sena', () => {
    expect(() =>
      service.create('tenant-1', {
        name: 'Color',
        durationMinutes: 60,
        priceCents: 100000,
        depositMode: DepositMode.Required,
      }),
    ).toThrow(BadRequestException);
  });

  it('acepta deposit_mode=none sin monto', async () => {
    const result = await service.create('tenant-1', {
      name: 'Corte',
      durationMinutes: 30,
      priceCents: 50000,
      depositMode: DepositMode.None,
    });
    expect(result.name).toBe('Corte');
    expect(repo.save).toHaveBeenCalled();
  });

  it('acepta hybrid con monto de sena', async () => {
    const result = await service.create('tenant-1', {
      name: 'Corte premium',
      durationMinutes: 45,
      priceCents: 80000,
      depositMode: DepositMode.Hybrid,
      depositAmountCents: 20000,
    });
    expect(result.depositAmountCents).toBe(20000);
  });
});
