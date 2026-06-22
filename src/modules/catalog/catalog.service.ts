import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { MembershipStatus } from '@/common/enums';
import { ComerciosService } from '@/modules/comercios/comercios.service';
import { FilesService } from '@/modules/files/files.service';
import { Membership } from '@/modules/comercios/entities/membership.entity';
import { Professional } from '@/modules/professionals/entities/professional.entity';
import { Service, ServiceAssignedMembership } from './entities/service.entity';
import { ServiceMembership } from './entities/service-membership.entity';
import { buildServicePricing } from './pricing';
import { CreateServiceDto, UpdateServiceDto } from './dto/service.dto';

interface PaymentFlags {
  allowDeposit: boolean;
  allowFullPayment: boolean;
  allowNoPayment: boolean;
  allowCash: boolean;
  allowTransfer: boolean;
  depositAmountCents: number | null;
}

@Injectable()
export class CatalogService {
  constructor(
    @InjectRepository(Service)
    private readonly services: Repository<Service>,
    @InjectRepository(ServiceMembership)
    private readonly serviceMemberships: Repository<ServiceMembership>,
    @InjectRepository(Professional)
    private readonly professionals: Repository<Professional>,
    private readonly comercios: ComerciosService,
    private readonly files: FilesService,
  ) {}

  /** Al menos una opción de pago habilitada; si hay seña, requiere monto. */
  private assertPaymentOptions(f: PaymentFlags): void {
    if (
      !f.allowDeposit &&
      !f.allowFullPayment &&
      !f.allowNoPayment &&
      !f.allowCash &&
      !f.allowTransfer
    ) {
      throw new BadRequestException(
        'El servicio debe permitir al menos una opción de pago (seña, pago completo, efectivo, transferencia o sin pago)',
      );
    }
    if (f.allowDeposit && (f.depositAmountCents == null || f.depositAmountCents <= 0)) {
      throw new BadRequestException('deposit_amount_cents es requerido cuando se permite seña');
    }
  }

  /**
   * Cobro online (seña / pago completo): requiere que TODOS los profesionales
   * asignados tengan su MercadoPago conectado (en "cualquiera" cualquiera puede
   * quedar asignado, así que todos deben poder cobrar). Las membresías deben venir
   * con su `professional` cargado.
   */
  private assertAllMembershipsMpConnected(memberships: Membership[], f: PaymentFlags): void {
    if (!f.allowDeposit && !f.allowFullPayment) return;
    const missing = memberships.filter((m) => !m.professional?.mpConnectedAt);
    if (missing.length > 0) {
      throw new BadRequestException(
        'Para habilitar seña o pago completo, todos los profesionales asignados deben tener su cuenta de MercadoPago conectada',
      );
    }
  }

  // ---- Helpers de asignación (servicio<->membresía) ----

  /** true si el servicio está asignado a la membresía (vía service_membership). */
  async isAssigned(serviceId: string, membershipId: string): Promise<boolean> {
    const count = await this.serviceMemberships.count({ where: { serviceId, membershipId } });
    return count > 0;
  }

  /** Subconjunto de serviceIds que están asignados a la membresía. */
  async filterAssignedServiceIds(membershipId: string, serviceIds: string[]): Promise<string[]> {
    if (serviceIds.length === 0) return [];
    const rows = await this.serviceMemberships.find({
      where: { membershipId, serviceId: In([...new Set(serviceIds)]) },
      select: { serviceId: true },
    });
    return rows.map((r) => r.serviceId);
  }

  /**
   * Membresías ACTIVAS que ofrecen el servicio (con su professional cargado),
   * ordenadas por antigüedad de la membresía (orden estable para asignación).
   */
  async activeAssignedMemberships(serviceId: string): Promise<Membership[]> {
    const rows = await this.serviceMemberships.find({
      where: { serviceId },
      relations: { membership: { professional: true } },
    });
    return rows
      .map((r) => r.membership)
      .filter((m): m is Membership => !!m && m.status === MembershipStatus.Active)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  /** Rellena `assignedMemberships` (membresías activas) en los servicios dados. */
  private async attachAssigned(servicesList: Service[]): Promise<Service[]> {
    if (servicesList.length === 0) return servicesList;
    const ids = servicesList.map((s) => s.id);
    const rows = await this.serviceMemberships.find({
      where: { serviceId: In(ids) },
      relations: { membership: { professional: true } },
    });
    const map = new Map<string, ServiceAssignedMembership[]>();
    for (const row of rows) {
      const m = row.membership;
      if (!m || m.status !== MembershipStatus.Active) continue;
      const list = map.get(row.serviceId) ?? [];
      list.push({
        membershipId: m.id,
        professionalId: m.professionalId,
        displayName: m.professional?.businessName ?? 'Profesional',
      });
      map.set(row.serviceId, list);
    }
    for (const s of servicesList) s.assignedMemberships = map.get(s.id) ?? [];
    return this.attachDerived(servicesList);
  }

  /**
   * Terminal común de las lecturas: rellena campos derivados (URLs firmadas de imágenes y
   * desglose de precios con/sin IVA). Lo usan todos los reads (comercio y por membresía).
   */
  private async attachDerived(servicesList: Service[]): Promise<Service[]> {
    if (servicesList.length === 0) return servicesList;
    // IVA del servicio resuelto contra el default del profesional creador (service.professionalId).
    const professionalIds = [...new Set(servicesList.map((s) => s.professionalId))];
    const professionals = await this.professionals.find({ where: { id: In(professionalIds) } });
    const professionalById = new Map(professionals.map((p) => [p.id, p]));

    await Promise.all(
      servicesList.map(async (s) => {
        s.imageUrls = await this.files.getSignedUrlsForKeys(s.imageKeys ?? []);
        s.pricing = buildServicePricing(s, professionalById.get(s.professionalId));
      }),
    );
    return servicesList;
  }

  private async assignMemberships(serviceId: string, membershipIds: string[]): Promise<void> {
    if (membershipIds.length === 0) return;
    await this.serviceMemberships.save(
      membershipIds.map((membershipId) =>
        this.serviceMemberships.create({ serviceId, membershipId }),
      ),
    );
  }

  // ---- A NIVEL COMERCIO: servicios del comercio asignados a N profesionales ----

  /** Servicios del comercio (todos) con sus membresías asignadas. */
  async listByComercio(comercioId: string): Promise<Service[]> {
    const list = await this.services.find({ where: { comercioId }, order: { name: 'ASC' } });
    return this.attachAssigned(list);
  }

  /** Servicios ACTIVOS del comercio con ≥1 profesional activo asignado (página pública). */
  async listPublicByComercio(comercioId: string): Promise<Service[]> {
    const list = await this.services.find({
      where: { comercioId, isActive: true },
      order: { name: 'ASC' },
    });
    const withAssigned = await this.attachAssigned(list);
    return withAssigned.filter((s) => (s.assignedMemberships?.length ?? 0) > 0);
  }

  async getForComercio(comercioId: string, id: string): Promise<Service> {
    const service = await this.services.findOne({ where: { id, comercioId } });
    if (!service) throw new NotFoundException('Servicio no encontrado');
    return (await this.attachAssigned([service]))[0];
  }

  async createForComercio(comercioId: string, dto: CreateServiceDto): Promise<Service> {
    const membershipIds = [...new Set(dto.membershipIds ?? [])];
    if (membershipIds.length === 0) {
      throw new BadRequestException('Asigná al menos un profesional al servicio');
    }
    // Valida que todas pertenezcan al comercio y estén activas (orden = dto).
    const memberships = await this.comercios.getActiveMembershipsInComercio(
      comercioId,
      membershipIds,
    );

    const allowDeposit = dto.allowDeposit ?? false;
    const allowFullPayment = dto.allowFullPayment ?? false;
    const allowCash = dto.allowCash ?? false;
    const allowTransfer = dto.allowTransfer ?? false;
    const allowNoPayment =
      dto.allowNoPayment ?? (!allowDeposit && !allowFullPayment && !allowCash && !allowTransfer);
    const depositAmountCents = dto.depositAmountCents ?? null;
    const flags = {
      allowDeposit,
      allowFullPayment,
      allowNoPayment,
      allowCash,
      allowTransfer,
      depositAmountCents,
    };
    this.assertPaymentOptions(flags);
    this.assertAllMembershipsMpConnected(memberships, flags);

    const creator = memberships[0];
    const service = await this.services.save(
      this.services.create({
        professionalId: creator.professionalId,
        comercioId,
        membershipId: creator.id,
        name: dto.name,
        description: dto.description ?? null,
        imageKeys: dto.imageKeys ?? [],
        durationMinutes: dto.durationMinutes,
        priceCents: dto.priceCents,
        allowDeposit,
        allowFullPayment,
        allowNoPayment,
        allowCash,
        allowTransfer,
        vatPercent: dto.vatPercent ?? null,
        vatChargedToClient: dto.vatChargedToClient ?? null,
        depositAmountCents,
        capacity: dto.capacity ?? 1,
        isActive: true,
      }),
    );
    await this.assignMemberships(
      service.id,
      memberships.map((m) => m.id),
    );
    return this.getForComercio(comercioId, service.id);
  }

  async updateForComercio(comercioId: string, id: string, dto: UpdateServiceDto): Promise<Service> {
    const service = await this.services.findOne({ where: { id, comercioId } });
    if (!service) throw new NotFoundException('Servicio no encontrado');

    // Set de membresías resultante (nuevo si viene membershipIds; si no, el actual).
    let newMemberships: Membership[] | null = null;
    if (dto.membershipIds !== undefined) {
      const ids = [...new Set(dto.membershipIds)];
      if (ids.length === 0) {
        throw new BadRequestException('Asigná al menos un profesional al servicio');
      }
      newMemberships = await this.comercios.getActiveMembershipsInComercio(comercioId, ids);
    }

    const flags: PaymentFlags = {
      allowDeposit: dto.allowDeposit ?? service.allowDeposit,
      allowFullPayment: dto.allowFullPayment ?? service.allowFullPayment,
      allowNoPayment: dto.allowNoPayment ?? service.allowNoPayment,
      allowCash: dto.allowCash ?? service.allowCash,
      allowTransfer: dto.allowTransfer ?? service.allowTransfer,
      depositAmountCents: dto.depositAmountCents ?? service.depositAmountCents,
    };
    this.assertPaymentOptions(flags);
    const assignedForMp = newMemberships ?? (await this.activeAssignedMemberships(id));
    this.assertAllMembershipsMpConnected(assignedForMp, flags);

    // Imágenes que dejan de estar referenciadas (reemplazadas o quitadas): se borran
    // de MinIO para no dejar objetos huérfanos ocupando espacio.
    const removedImageKeys =
      dto.imageKeys !== undefined
        ? (service.imageKeys ?? []).filter((k) => !dto.imageKeys!.includes(k))
        : [];

    const { membershipIds: _ignored, ...scalar } = dto;
    Object.assign(service, scalar);

    if (newMemberships) {
      await this.serviceMemberships.delete({ serviceId: id });
      await this.assignMemberships(
        id,
        newMemberships.map((m) => m.id),
      );
      // El creador/legacy debe ser uno de los asignados.
      service.membershipId = newMemberships[0].id;
      service.professionalId = newMemberships[0].professionalId;
    }
    await this.services.save(service);
    if (removedImageKeys.length > 0) await this.files.removeByKeys(removedImageKeys);
    return this.getForComercio(comercioId, id);
  }

  async deactivateForComercio(comercioId: string, id: string): Promise<Service> {
    const service = await this.services.findOne({ where: { id, comercioId } });
    if (!service) throw new NotFoundException('Servicio no encontrado');
    service.isActive = false;
    await this.services.save(service);
    return this.getForComercio(comercioId, id);
  }

  // ---- Por membresía (profesional-en-comercio): lectura de servicios ofrecidos ----
  async listActiveByMembership(membershipId: string): Promise<Service[]> {
    const rows = await this.serviceMemberships.find({
      where: { membershipId },
      relations: { service: true },
    });
    const list = rows
      .map((r) => r.service)
      .filter((s): s is Service => !!s && s.isActive)
      .sort((a, b) => a.name.localeCompare(b.name));
    return this.attachDerived(list);
  }

  async listAllByMembership(membershipId: string): Promise<Service[]> {
    const rows = await this.serviceMemberships.find({
      where: { membershipId },
      relations: { service: true },
    });
    const list = rows
      .map((r) => r.service)
      .filter((s): s is Service => !!s)
      .sort((a, b) => a.name.localeCompare(b.name));
    return this.attachDerived(list);
  }

  async findByMembership(membershipId: string, id: string): Promise<Service> {
    const service = await this.services.findOne({ where: { id } });
    if (!service || !(await this.isAssigned(id, membershipId))) {
      throw new NotFoundException('Servicio no encontrado');
    }
    return (await this.attachDerived([service]))[0];
  }

  /**
   * Compat: crea un servicio "de" una membresía (comercio-de-uno o creación rápida
   * del profesional). Delega en createForComercio asignándolo a esa membresía.
   */
  async createForMembership(membershipId: string, dto: CreateServiceDto): Promise<Service> {
    const membership = await this.comercios.getMembershipById(membershipId);
    return this.createForComercio(membership.comercioId, { ...dto, membershipIds: [membershipId] });
  }

  async updateByMembership(
    membershipId: string,
    id: string,
    dto: UpdateServiceDto,
  ): Promise<Service> {
    const service = await this.findByMembership(membershipId, id);
    // Un miembro no puede reasignar membresías por esta vía (eso es del comercio).
    const { membershipIds: _ignored, ...scalar } = dto;
    return this.updateForComercio(service.comercioId, id, scalar);
  }

  async deactivateByMembership(membershipId: string, id: string): Promise<Service> {
    const service = await this.findByMembership(membershipId, id);
    return this.deactivateForComercio(service.comercioId, id);
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
