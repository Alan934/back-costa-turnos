import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ComerciosService } from '@/modules/comercios/comercios.service';
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
    private readonly comercios: ComerciosService,
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

  /**
   * Las opciones de cobro online (seña / pago completo) requieren que el
   * profesional tenga su cuenta de MercadoPago conectada. El front ya lo valida
   * por UX, pero el back lo rechaza igual (el front no es garantía de seguridad).
   */
  private async assertMpConnectedForPaidOptions(
    professionalId: string,
    f: PaymentFlags,
  ): Promise<void> {
    if (!f.allowDeposit && !f.allowFullPayment) return;
    if (!(await this.comercios.hasMpConnected(professionalId))) {
      throw new BadRequestException(
        'El profesional debe conectar su cuenta de MercadoPago para habilitar seña o pago completo',
      );
    }
  }

  // ---- Por membresía (profesional-en-comercio): servicios/precios de ese comercio ----
  listActiveByMembership(membershipId: string): Promise<Service[]> {
    return this.services.find({
      where: { membershipId, isActive: true },
      order: { name: 'ASC' },
    });
  }

  listAllByMembership(membershipId: string): Promise<Service[]> {
    return this.services.find({
      where: { membershipId },
      order: { name: 'ASC' },
    });
  }

  async findByMembership(membershipId: string, id: string): Promise<Service> {
    const service = await this.services.findOne({ where: { id, membershipId } });
    if (!service) throw new NotFoundException('Servicio no encontrado');
    return service;
  }

  async createForMembership(membershipId: string, dto: CreateServiceDto): Promise<Service> {
    // La membresía nos da el professional dueño (para el tenanting legacy).
    const membership = await this.comercios.getMembershipById(membershipId);

    const allowDeposit = dto.allowDeposit ?? false;
    const allowFullPayment = dto.allowFullPayment ?? false;
    const allowNoPayment = dto.allowNoPayment ?? (!allowDeposit && !allowFullPayment);
    const depositAmountCents = dto.depositAmountCents ?? null;

    this.assertPaymentOptions({ allowDeposit, allowFullPayment, allowNoPayment, depositAmountCents });
    await this.assertMpConnectedForPaidOptions(membership.professionalId, {
      allowDeposit,
      allowFullPayment,
      allowNoPayment,
      depositAmountCents,
    });

    const service = this.services.create({
      professionalId: membership.professionalId,
      membershipId,
      name: dto.name,
      durationMinutes: dto.durationMinutes,
      priceCents: dto.priceCents,
      allowDeposit,
      allowFullPayment,
      allowNoPayment,
      depositAmountCents,
      capacity: dto.capacity ?? 1,
      isActive: true,
    });
    return this.services.save(service);
  }

  async updateByMembership(
    membershipId: string,
    id: string,
    dto: UpdateServiceDto,
  ): Promise<Service> {
    const service = await this.findByMembership(membershipId, id);
    const flags: PaymentFlags = {
      allowDeposit: dto.allowDeposit ?? service.allowDeposit,
      allowFullPayment: dto.allowFullPayment ?? service.allowFullPayment,
      allowNoPayment: dto.allowNoPayment ?? service.allowNoPayment,
      depositAmountCents: dto.depositAmountCents ?? service.depositAmountCents,
    };
    this.assertPaymentOptions(flags);
    await this.assertMpConnectedForPaidOptions(service.professionalId, flags);
    Object.assign(service, dto);
    return this.services.save(service);
  }

  async deactivateByMembership(membershipId: string, id: string): Promise<Service> {
    const service = await this.findByMembership(membershipId, id);
    service.isActive = false;
    return this.services.save(service);
  }

  // ---- Compat por professional (comercio-de-uno): resuelve la membresía personal ----
  private personalMembershipId(professionalId: string): Promise<string> {
    return this.comercios.getPersonalMembership(professionalId).then((m) => m.id);
  }

  async listActive(professionalId: string): Promise<Service[]> {
    return this.listActiveByMembership(await this.personalMembershipId(professionalId));
  }

  async listAll(professionalId: string): Promise<Service[]> {
    return this.listAllByMembership(await this.personalMembershipId(professionalId));
  }

  async findById(professionalId: string, id: string): Promise<Service> {
    return this.findByMembership(await this.personalMembershipId(professionalId), id);
  }

  async create(professionalId: string, dto: CreateServiceDto): Promise<Service> {
    return this.createForMembership(await this.personalMembershipId(professionalId), dto);
  }

  async update(professionalId: string, id: string, dto: UpdateServiceDto): Promise<Service> {
    return this.updateByMembership(await this.personalMembershipId(professionalId), id, dto);
  }

  async deactivate(professionalId: string, id: string): Promise<Service> {
    return this.deactivateByMembership(await this.personalMembershipId(professionalId), id);
  }
}
