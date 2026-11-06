import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '@/redis/redis.module';
import { BLOCKED_ACCOUNT_PREFIX, BLOCKED_ACCOUNT_TTL_S } from '@/modules/auth/blocked-account';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Account } from './entities/account.entity';
import { AccountStatus } from '@/common/enums';

@Injectable()
export class AccountsService {
  constructor(
    @InjectRepository(Account)
    private readonly accounts: Repository<Account>,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  findById(id: string): Promise<Account | null> {
    return this.accounts.findOne({ where: { id } });
  }

  findByEmail(email: string): Promise<Account | null> {
    return this.accounts.findOne({ where: { email } });
  }

  findByGoogleId(googleId: string): Promise<Account | null> {
    return this.accounts.findOne({ where: { googleId } });
  }

  /** Crea una cuenta reclamada (con password ya hasheada) o sin password. */
  create(data: Partial<Account>): Promise<Account> {
    const account = this.accounts.create({
      status: AccountStatus.Active,
      isClaimed: false,
      isPlatformAdmin: false,
      ...data,
    });
    return this.accounts.save(account);
  }

  /** Crea una cuenta "no reclamada": email sin password (cargada por terceros). */
  async findOrCreateUnclaimed(email: string): Promise<Account> {
    const existing = await this.findByEmail(email);
    if (existing) return existing;
    return this.create({ email, passwordHash: null, isClaimed: false });
  }

  save(account: Account): Promise<Account> {
    return this.accounts.save(account);
  }

  async setRefreshTokenHash(id: string, hash: string | null): Promise<void> {
    await this.accounts.update({ id }, { refreshTokenHash: hash });
  }

  async setPassword(id: string, passwordHash: string): Promise<void> {
    await this.accounts.update({ id }, { passwordHash, isClaimed: true });
  }

  async markEmailVerified(id: string): Promise<void> {
    await this.accounts.update({ id }, { emailVerifiedAt: new Date() });
  }

  /** Bloquea o reactiva una cuenta (status). Al bloquear, revoca la sesion. */
  async setStatus(id: string, status: AccountStatus): Promise<Account> {
    const account = await this.findById(id);
    if (!account) throw new NotFoundException('Cuenta no encontrada');
    account.status = status;
    if (status === AccountStatus.Blocked) account.refreshTokenHash = null;
    const saved = await this.accounts.save(account);
    // Corta también los access tokens vigentes (ver blocked-account.ts).
    const key = `${BLOCKED_ACCOUNT_PREFIX}${id}`;
    if (status === AccountStatus.Blocked) {
      await this.redis.set(key, '1', 'EX', BLOCKED_ACCOUNT_TTL_S);
    } else {
      await this.redis.del(key);
    }
    return saved;
  }
}
