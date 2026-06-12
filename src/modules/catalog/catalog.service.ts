import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Service } from './entities/service.entity';
import { CreateServiceDto, UpdateServiceDto } from './dto/service.dto';

interface PaymentFlags {
  allowDeposit: boolean;
  allowFullPayment: boolean;
  allowNoPayment: boolean;
  depositAmountCents: number | null;
}

@Injectable()
export class CatalogService {
  constructor(
    @InjectRepository(Service)
    private readonly services: Repository<Service>,
  ) {}

  /** Al menos una opción de pago habilitada; si hay seña, requiere monto. */
  private assertPaymentOptions(f: PaymentFlags): void {
    if (!f.allowDeposit && !f.allowFullPayment && !f.allowNoPayment) {
      throw new BadRequestException(
        'El servicio debe permitir al menos una opción de pago (seña, pago completo o sin pago)',
      );
    }
    if (f.allowDeposit && (f.depositAmountCents == null || f.depositAmountCents <= 0)) {
      throw new BadRequestException('deposit_amount_cents es requerido cuando se permite seña');
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
    // Default: si no manda ninguna opción, queda "sin pago".
    const allowDeposit = dto.allowDeposit ?? false;
    const allowFullPayment = dto.allowFullPayment ?? false;
    const allowNoPayment = dto.allowNoPayment ?? (!allowDeposit && !allowFullPayment);
    const depositAmountCents = dto.depositAmountCents ?? null;

    this.assertPaymentOptions({ allowDeposit, allowFullPayment, allowNoPayment, depositAmountCents });

    const service = this.services.create({
      professionalId: tenantId,
      name: dto.name,
      durationMinutes: dto.durationMinutes,
      priceCents: dto.priceCents,
      allowDeposit,
      allowFullPayment,
      allowNoPayment,
      depositAmountCents,
      isActive: true,
    });
    return this.services.save(service);
  }

  async update(tenantId: string, id: string, dto: UpdateServiceDto): Promise<Service> {
    const service = await this.findById(tenantId, id);
    this.assertPaymentOptions({
      allowDeposit: dto.allowDeposit ?? service.allowDeposit,
      allowFullPayment: dto.allowFullPayment ?? service.allowFullPayment,
      allowNoPayment: dto.allowNoPayment ?? service.allowNoPayment,
      depositAmountCents: dto.depositAmountCents ?? service.depositAmountCents,
    });
    Object.assign(service, dto);
    return this.services.save(service);
  }

  async deactivate(tenantId: string, id: string): Promise<Service> {
    const service = await this.findById(tenantId, id);
    service.isActive = false;
    return this.services.save(service);
  }
}
