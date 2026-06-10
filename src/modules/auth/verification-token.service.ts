import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import * as argon2 from 'argon2';
import { randomInt } from 'node:crypto';
import { VerificationToken } from './entities/verification-token.entity';
import { VerificationPurpose } from '@/common/enums';

interface IssueInput {
  contact: string;
  purpose: VerificationPurpose;
  accountId?: string | null;
  ttlMinutes?: number;
}

@Injectable()
export class VerificationTokenService {
  constructor(
    @InjectRepository(VerificationToken)
    private readonly tokens: Repository<VerificationToken>,
  ) {}

  /**
   * Emite un codigo numerico de 6 digitos, lo guarda hasheado y devuelve el
   * codigo en claro (para enviarlo por el canal correspondiente).
   */
  async issue(input: IssueInput): Promise<{ code: string; token: VerificationToken }> {
    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const codeHash = await argon2.hash(code);
    const expiresAt = new Date(Date.now() + (input.ttlMinutes ?? 15) * 60_000);

    const token = this.tokens.create({
      contact: input.contact,
      purpose: input.purpose,
      accountId: input.accountId ?? null,
      codeHash,
      expiresAt,
      usedAt: null,
    });
    await this.tokens.save(token);
    return { code, token };
  }

  /**
   * Verifica un codigo para un contacto+proposito. Si es valido, lo marca usado
   * y devuelve el token (con accountId asociado, si lo tenia).
   */
  async consume(
    contact: string,
    purpose: VerificationPurpose,
    code: string,
  ): Promise<VerificationToken | null> {
    const candidates = await this.tokens.find({
      where: { contact, purpose, usedAt: undefined },
      order: { createdAt: 'DESC' },
      take: 10,
    });

    const now = new Date();
    for (const token of candidates) {
      if (token.usedAt) continue;
      if (token.expiresAt.getTime() < now.getTime()) continue;
      const ok = await argon2.verify(token.codeHash, code);
      if (ok) {
        token.usedAt = now;
        await this.tokens.save(token);
        return token;
      }
    }
    return null;
  }

  /** Limpieza de tokens vencidos (invocable por un job). */
  async purgeExpired(): Promise<number> {
    const res = await this.tokens.delete({ expiresAt: LessThan(new Date()) });
    return res.affected ?? 0;
  }
}
