import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DepositMode } from '@/common/enums';
import { Service } from './entities/service.entity';
import { CreateServiceDto, UpdateServiceDto } from './dto/service.dto';

@Injectable()
export class CatalogService {
  constructor(
    @InjectRepository(Service)
    private readonly services: Repository<Service>,
  ) {}

  private assertDepositConsistency(
    depositMode: DepositMode | undefined,
    depositAmountCents: number | null | undefined,
  ): void {
    if (depositMode && depositMode !== DepositMode.None) {
      if (depositAmountCents == null || depositAmountCents <= 0) {
        throw new BadRequestException(
          'deposit_amount_cents es requerido cuando deposit_mode no es "none"',
        );
      }
    }
  }

  listActive(tenantId: string): Promise<Service[]> {
    return this.services.find({
      where: { professionalId: tenantId, isActive: true },
      order: { name: 'ASC' },
    });
  }

  listAll(tenantId: string): Promise<Service[]> {
    return this.services.find({
      where: { professionalId: tenantId },
      order: { name: 'ASC' },
    });
  }

  async findById(tenantId: string, id: string): Promise<Service> {
    const service = await this.services.findOne({
      where: { id, professionalId: tenantId },
    });
    if (!service) throw new NotFoundException('Servicio no encontrado');
    return service;
  }

  create(tenantId: string, dto: CreateServiceDto): Promise<Service> {
    this.assertDepositConsistency(dto.depositMode, dto.depositAmountCents);
    const service = this.services.create({
      professionalId: tenantId,
      name: dto.name,
      durationMinutes: dto.durationMinutes,
      priceCents: dto.priceCents,
      depositMode: dto.depositMode ?? DepositMode.None,
      depositAmountCents: dto.depositAmountCents ?? null,
      isActive: true,
    });
    return this.services.save(service);
  }

  async update(tenantId: string, id: string, dto: UpdateServiceDto): Promise<Service> {
    const service = await this.findById(tenantId, id);
    const nextMode = dto.depositMode ?? service.depositMode;
    const nextAmount = dto.depositAmountCents ?? service.depositAmountCents ?? undefined;
    this.assertDepositConsistency(nextMode, nextAmount);
    Object.assign(service, dto);
    return this.services.save(service);
  }

  async deactivate(tenantId: string, id: string): Promise<Service> {
    const service = await this.findById(tenantId, id);
    service.isActive = false;
    return this.services.save(service);
  }
}
