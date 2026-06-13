import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import * as argon2 from 'argon2';
import { MembershipStatus } from '@/common/enums';
import { AppConfig } from '@/config/configuration';
import { AccountsService } from '@/modules/identity/accounts.service';
import { Professional } from '@/modules/professionals/entities/professional.entity';
import { Comercio } from './entities/comercio.entity';
import { Membership } from './entities/membership.entity';
import { CreateComercialDto, UpdateComercioDto } from './dto/comercio.dto';

@Injectable()
export class ComerciosService {
  constructor(
    @InjectRepository(Comercio)
    private readonly comercios: Repository<Comercio>,
    @InjectRepository(Membership)
    private readonly memberships: Repository<Membership>,
    @InjectRepository(Professional)
    private readonly professionals: Repository<Professional>,
    private readonly accounts: AccountsService,
    private readonly config: ConfigService,
  ) {}

  /** Comercios que administra una cuenta comercial. */
  getOwnedComercios(accountId: string): Promise<Comercio[]> {
    return this.comercios.find({ where: { accountId }, order: { createdAt: 'DESC' } });
  }

  async getComercio(comercioId: string): Promise<Comercio> {
    const comercio = await this.comercios.findOne({ where: { id: comercioId } });
    if (!comercio) throw new NotFoundException('Comercio no encontrado');
    return comercio;
  }

  async updateComercio(comercioId: string, dto: UpdateComercioDto): Promise<Comercio> {
    const comercio = await this.getComercio(comercioId);
    Object.assign(comercio, dto);
    return this.comercios.save(comercio);
  }

  /** Roster del comercio: membresías con el profesional. */
  listMembers(comercioId: string): Promise<Membership[]> {
    return this.memberships.find({
      where: { comercioId },
      relations: { professional: true },
      order: { createdAt: 'ASC' },
    });
  }

  /** Comercios donde trabaja el profesional (membresías). */
  listMyMemberships(professionalId: string): Promise<Membership[]> {
    return this.memberships.find({
      where: { professionalId },
      relations: { comercio: true },
      order: { createdAt: 'ASC' },
    });
  }

  /**
   * Crea un comercio-de-uno (isPersonal) para un profesional solo + su membresía
   * activa. Se usa al registrarse/onboardear un profesional. Idempotente por slug.
   */
  async ensurePersonalComercio(
    professional: Professional,
    manager?: EntityManager,
  ): Promise<{ comercio: Comercio; membership: Membership }> {
    const comercioRepo = manager ? manager.getRepository(Comercio) : this.comercios;
    const membershipRepo = manager ? manager.getRepository(Membership) : this.memberships;

    let comercio = await comercioRepo.findOne({ where: { slug: professional.slug } });
    if (!comercio) {
      comercio = await comercioRepo.save(
        comercioRepo.create({
          accountId: professional.accountId,
          name: professional.businessName,
          slug: professional.slug,
          address: professional.address,
          timezone: professional.timezone,
          isPersonal: true,
          publicPageSettings: professional.publicPageSettings,
        }),
      );
    }

    let membership = await membershipRepo.findOne({
      where: { professionalId: professional.id, comercioId: comercio.id },
    });
    if (!membership) {
      membership = await membershipRepo.save(
        membershipRepo.create({
          professionalId: professional.id,
          comercioId: comercio.id,
          status: MembershipStatus.Active,
        }),
      );
    }
    return { comercio, membership };
  }

  /** Admin: crea una cuenta comercial + su comercio (no personal). */
  async createComercialWithComercio(dto: CreateComercialDto): Promise<Comercio> {
    const existing = await this.accounts.findByEmail(dto.email);
    if (existing && existing.isClaimed) {
      throw new BadRequestException('Ya existe una cuenta con ese email');
    }
    const slugTaken = await this.comercios.findOne({ where: { slug: dto.slug } });
    if (slugTaken) throw new ConflictException('El slug ya está en uso');

    const passwordHash = await argon2.hash(dto.password);
    let account = existing;
    if (account) {
      account.passwordHash = passwordHash;
      account.isClaimed = true;
      account = await this.accounts.save(account);
    } else {
      account = await this.accounts.create({
        email: dto.email,
        passwordHash,
        isClaimed: true,
      });
    }

    const timezone = dto.timezone ?? this.config.getOrThrow<AppConfig>('app').defaultTimezone;
    return this.comercios.save(
      this.comercios.create({
        accountId: account.id,
        name: dto.comercioName,
        slug: dto.slug,
        address: dto.address ?? null,
        timezone,
        isPersonal: false,
      }),
    );
  }

  /** Crea una membresía activa (al aceptar una invitación). */
  async addMembership(professionalId: string, comercioId: string): Promise<Membership> {
    const existing = await this.memberships.findOne({ where: { professionalId, comercioId } });
    if (existing) {
      if (existing.status !== MembershipStatus.Active) {
        existing.status = MembershipStatus.Active;
        return this.memberships.save(existing);
      }
      return existing;
    }
    return this.memberships.save(
      this.memberships.create({
        professionalId,
        comercioId,
        status: MembershipStatus.Active,
      }),
    );
  }

  /** professional (worker) de una cuenta, o null. */
  findProfessionalByAccount(accountId: string): Promise<Professional | null> {
    return this.professionals.findOne({ where: { accountId } });
  }
}
