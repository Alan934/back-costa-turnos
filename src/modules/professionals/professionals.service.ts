import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { Comercio } from '@/modules/comercios/entities/comercio.entity';
import { Person } from '@/modules/identity/entities/person.entity';
import { ConfigService } from '@nestjs/config';
import { AppConfig, SubscriptionConfig } from '@/config/configuration';
import { SubscriptionStatus } from '@/common/enums';
import { Subscription } from '@/modules/subscriptions/entities/subscription.entity';
import { ComerciosService } from '@/modules/comercios/comercios.service';
import { Professional } from './entities/professional.entity';
import { Staff } from './entities/staff.entity';
import {
  CreateStaffDto,
  OnboardProfessionalDto,
  SlugAvailabilityDto,
  UpdateProfessionalDto,
  UpdateStaffDto,
} from './dto/professional.dto';

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

@Injectable()
export class ProfessionalsService {
  constructor(
    @InjectRepository(Professional)
    private readonly professionals: Repository<Professional>,
    @InjectRepository(Staff)
    private readonly staff: Repository<Staff>,
    @InjectRepository(Subscription)
    private readonly subscriptions: Repository<Subscription>,
    private readonly comercios: ComerciosService,
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
  ) {}

  /**
   * Onboarding: crea el professional (tenant), un staff por defecto y una
   * suscripcion en trial. Todo en una transaccion.
   */
  async onboard(accountId: string, dto: OnboardProfessionalDto): Promise<Professional> {
    const existing = await this.professionals.findOne({ where: { accountId } });
    if (existing) {
      throw new ConflictException('Esta cuenta ya tiene un professional');
    }
    // El slug se comparte con los comercios (/r/:slug). Sin chequear también ahí, un
    // profesional que elegía el slug de un comercio AJENO quedaba como miembro activo de ese
    // comercio (ensurePersonalComercio reutiliza el comercio que encuentra por slug).
    if ((await this.takenSlugs([dto.slug])).has(dto.slug)) {
      throw new ConflictException({ message: 'El slug ya esta en uso', error: 'slug_taken' });
    }

    const timezone = dto.timezone ?? this.config.getOrThrow<AppConfig>('app').defaultTimezone;

    return this.dataSource.transaction(async (manager) => {
      const professional = await manager.save(
        manager.create(Professional, {
          accountId,
          businessName: dto.businessName,
          slug: dto.slug,
          timezone,
          address: dto.address ?? null,
        }),
      );

      // Quien atiende es la PERSONA, no el negocio: el integrante por defecto lleva su nombre
      // (si no hay uno usable, p. ej. cuenta de Google sin nombre, cae al del negocio).
      const person = await manager.findOne(Person, {
        where: { accountId },
        order: { id: 'ASC' },
      });
      const personName = person?.fullName?.trim();
      const displayName = personName && !personName.includes('@') ? personName : dto.businessName;

      await manager.save(
        manager.create(Staff, {
          professionalId: professional.id,
          accountId,
          displayName,
          isActive: true,
        }),
      );

      // Comercio-de-uno (lugar propio) + membresía activa para trabajar solo.
      await this.comercios.ensurePersonalComercio(professional, manager);

      const subCfg = this.config.getOrThrow<SubscriptionConfig>('subscription');
      const now = new Date();
      const trialEnds = new Date(now.getTime() + subCfg.trialDays * 86_400_000);
      await manager.save(
        manager.create(Subscription, {
          professionalId: professional.id,
          status: SubscriptionStatus.Trial,
          trialEndsAt: trialEnds,
          currentPeriodStart: now,
          currentPeriodEnd: trialEnds,
          amountCents: subCfg.priceCents,
        }),
      );

      return professional;
    });
  }

  /** De una lista de slugs, cuáles ya usa algún profesional o comercio. */
  private async takenSlugs(slugs: string[]): Promise<Set<string>> {
    if (slugs.length === 0) return new Set();
    const [pros, comercios] = await Promise.all([
      this.professionals.find({ where: { slug: In(slugs) }, select: { slug: true } }),
      this.dataSource
        .getRepository(Comercio)
        .find({ where: { slug: In(slugs) }, select: { slug: true } }),
    ]);
    return new Set([...pros, ...comercios].map((r) => r.slug));
  }

  /**
   * Disponibilidad de un enlace público (para avisar mientras se escribe, antes de enviar).
   * Si está tomado, propone hasta 3 alternativas libres (`slug-2`, `slug-3`, ...).
   */
  async checkSlug(raw: string): Promise<SlugAvailabilityDto> {
    const slug = raw.trim().toLowerCase();
    if (!SLUG_REGEX.test(slug) || slug.length > 60) {
      return { slug, valid: false, available: false, suggestions: [] };
    }
    const candidates = Array.from({ length: 8 }, (_, i) => `${slug}-${i + 2}`);
    const taken = await this.takenSlugs([slug, ...candidates]);
    const available = !taken.has(slug);
    return {
      slug,
      valid: true,
      available,
      suggestions: available ? [] : candidates.filter((c) => !taken.has(c)).slice(0, 3),
    };
  }

  async findById(id: string): Promise<Professional> {
    const professional = await this.professionals.findOne({ where: { id } });
    if (!professional) throw new NotFoundException('Professional no encontrado');
    return professional;
  }

  async findBySlug(slug: string): Promise<Professional> {
    const professional = await this.professionals.findOne({ where: { slug } });
    if (!professional) throw new NotFoundException('Pagina no encontrada');
    return professional;
  }

  async update(tenantId: string, dto: UpdateProfessionalDto): Promise<Professional> {
    const professional = await this.findById(tenantId);
    Object.assign(professional, dto);
    return this.professionals.save(professional);
  }

  async markNewsSeen(tenantId: string): Promise<Professional> {
    await this.professionals.update({ id: tenantId }, { newsSeenAt: new Date() });
    return this.findById(tenantId);
  }

  // ---- Staff ----
  listStaff(tenantId: string): Promise<Staff[]> {
    return this.staff.find({
      where: { professionalId: tenantId },
      order: { createdAt: 'ASC' },
    });
  }

  async findStaff(tenantId: string, staffId: string): Promise<Staff> {
    const staff = await this.staff.findOne({
      where: { id: staffId, professionalId: tenantId },
    });
    if (!staff) throw new NotFoundException('Staff no encontrado');
    return staff;
  }

  createStaff(tenantId: string, dto: CreateStaffDto): Promise<Staff> {
    const staff = this.staff.create({
      professionalId: tenantId,
      displayName: dto.displayName,
      isActive: true,
    });
    return this.staff.save(staff);
  }

  async updateStaff(tenantId: string, staffId: string, dto: UpdateStaffDto): Promise<Staff> {
    const staff = await this.findStaff(tenantId, staffId);
    Object.assign(staff, dto);
    return this.staff.save(staff);
  }

  async deactivateStaff(tenantId: string, staffId: string): Promise<void> {
    const staff = await this.findStaff(tenantId, staffId);
    if (!staff.isActive) throw new BadRequestException('El staff ya esta inactivo');
    staff.isActive = false;
    await this.staff.save(staff);
  }
}
