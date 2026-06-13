import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
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
  UpdateProfessionalDto,
  UpdateStaffDto,
} from './dto/professional.dto';

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
    const slugTaken = await this.professionals.findOne({ where: { slug: dto.slug } });
    if (slugTaken) throw new ConflictException('El slug ya esta en uso');

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

      await manager.save(
        manager.create(Staff, {
          professionalId: professional.id,
          accountId,
          displayName: dto.businessName,
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
