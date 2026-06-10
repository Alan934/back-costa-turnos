import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomInt } from 'node:crypto';
import { RaffleStatus, VerificationPurpose } from '@/common/enums';
import { AccountsService } from '@/modules/identity/accounts.service';
import { PersonsService } from '@/modules/identity/persons.service';
import { VerificationTokenService } from '@/modules/auth/verification-token.service';
import { Raffle } from './entities/raffle.entity';
import { RafflePrize } from './entities/raffle-prize.entity';
import { RaffleEntry } from './entities/raffle-entry.entity';
import {
  AddEntryDto,
  AddParticipantsByEmailDto,
  CreatePrizeDto,
  CreateRaffleDto,
} from './dto/raffle.dto';

@Injectable()
export class RafflesService {
  private readonly logger = new Logger(RafflesService.name);

  constructor(
    @InjectRepository(Raffle)
    private readonly raffles: Repository<Raffle>,
    @InjectRepository(RafflePrize)
    private readonly prizes: Repository<RafflePrize>,
    @InjectRepository(RaffleEntry)
    private readonly entries: Repository<RaffleEntry>,
    private readonly accounts: AccountsService,
    private readonly persons: PersonsService,
    private readonly verification: VerificationTokenService,
  ) {}

  list(tenantId: string): Promise<Raffle[]> {
    return this.raffles.find({
      where: { professionalId: tenantId },
      order: { createdAt: 'DESC' },
    });
  }

  create(tenantId: string, dto: CreateRaffleDto): Promise<Raffle> {
    const raffle = this.raffles.create({
      professionalId: tenantId,
      name: dto.name,
      status: RaffleStatus.Draft,
    });
    return this.raffles.save(raffle);
  }

  async get(tenantId: string, id: string): Promise<Raffle> {
    const raffle = await this.raffles.findOne({
      where: { id, professionalId: tenantId },
    });
    if (!raffle) throw new NotFoundException('Sorteo no encontrado');
    return raffle;
  }

  async addPrize(tenantId: string, raffleId: string, dto: CreatePrizeDto): Promise<RafflePrize> {
    await this.get(tenantId, raffleId);
    const prize = this.prizes.create({
      raffleId,
      name: dto.name,
      photoKey: dto.photoKey ?? null,
      displayOrder: dto.displayOrder ?? 0,
    });
    return this.prizes.save(prize);
  }

  async listEntries(tenantId: string, raffleId: string): Promise<RaffleEntry[]> {
    await this.get(tenantId, raffleId);
    return this.entries.find({ where: { raffleId }, order: { number: 'ASC' } });
  }

  async addEntry(tenantId: string, raffleId: string, dto: AddEntryDto): Promise<RaffleEntry> {
    await this.get(tenantId, raffleId);
    const entry = this.entries.create({
      raffleId,
      number: dto.number,
      label: dto.label ?? null,
      personId: dto.personId ?? null,
    });
    return this.entries.save(entry);
  }

  /**
   * Carga participantes por email: crea (o reutiliza) una person + account no
   * reclamada y emite un codigo de reclamo para que luego sean duenos del panel.
   */
  async addParticipantsByEmail(
    tenantId: string,
    raffleId: string,
    dto: AddParticipantsByEmailDto,
  ): Promise<RaffleEntry[]> {
    await this.get(tenantId, raffleId);
    const created: RaffleEntry[] = [];

    for (const p of dto.participants) {
      const account = await this.accounts.findOrCreateUnclaimed(p.email);
      const person = await this.persons.findOrCreate({
        fullName: p.fullName ?? p.email,
        email: p.email,
        accountId: account.id,
      });
      const entry = await this.entries.save(
        this.entries.create({
          raffleId,
          number: p.number,
          label: p.label ?? null,
          personId: person.id,
        }),
      );
      created.push(entry);

      if (!account.isClaimed) {
        const { code } = await this.verification.issue({
          contact: p.email,
          purpose: VerificationPurpose.AccountClaim,
          accountId: account.id,
        });
        this.logger.debug(`Codigo de reclamo para ${p.email}: ${code}`);
      }
    }

    return created;
  }

  /** Sortea un ganador al azar entre las entradas y cierra el sorteo. */
  async draw(tenantId: string, raffleId: string): Promise<Raffle> {
    const raffle = await this.get(tenantId, raffleId);
    if (raffle.status === RaffleStatus.Finished) {
      throw new BadRequestException('El sorteo ya finalizo');
    }
    const entries = await this.entries.find({ where: { raffleId } });
    if (entries.length === 0) {
      throw new BadRequestException('El sorteo no tiene participantes');
    }
    const winner = entries[randomInt(0, entries.length)];
    raffle.winnerEntryId = winner.id;
    raffle.status = RaffleStatus.Finished;
    raffle.finishedAt = new Date();
    return this.raffles.save(raffle);
  }
}
