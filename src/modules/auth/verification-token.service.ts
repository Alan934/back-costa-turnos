import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, LessThan, MoreThan, Repository } from 'typeorm';
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

/** Intentos máximos por código antes de quemarlo (6 dígitos = 1M de combinaciones). */
export const MAX_CODE_ATTEMPTS = 5;
/** Espera mínima entre dos envíos de código al mismo contacto+propósito. */
export const CODE_RESEND_COOLDOWN_MS = 60_000;

/** Normaliza el contacto (email) para que mayúsculas/espacios no multipliquen los intentos. */
function normalizeContact(contact: string): string {
  return contact.trim().toLowerCase();
}

@Injectable()
export class VerificationTokenService {
  constructor(
    @InjectRepository(VerificationToken)
    private readonly tokens: Repository<VerificationToken>,
  ) {}

  /**
   * ¿Se puede emitir un código nuevo ahora? false si ya se mandó uno hace menos del
   * cooldown (evita usar los endpoints como bombardeo de emails y acumular códigos).
   */
  async canIssue(contact: string, purpose: VerificationPurpose): Promise<boolean> {
    const recent = await this.tokens.findOne({
      where: {
        contact: normalizeContact(contact),
        purpose,
        createdAt: MoreThan(new Date(Date.now() - CODE_RESEND_COOLDOWN_MS)),
      },
      select: { id: true },
    });
    return !recent;
  }

  /**
   * Emite un codigo numerico de 6 digitos, lo guarda hasheado y devuelve el
   * codigo en claro (para enviarlo por el canal correspondiente). Invalida los
   * codigos anteriores vigentes del mismo contacto+proposito: solo el ultimo sirve.
   */
  async issue(input: IssueInput): Promise<{ code: string; token: VerificationToken }> {
    const contact = normalizeContact(input.contact);
    await this.tokens.update(
      { contact, purpose: input.purpose, usedAt: IsNull() },
      { usedAt: new Date() },
    );

    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const codeHash = await argon2.hash(code);
    const expiresAt = new Date(Date.now() + (input.ttlMinutes ?? 15) * 60_000);

    const token = this.tokens.create({
      contact,
      purpose: input.purpose,
      accountId: input.accountId ?? null,
      codeHash,
      expiresAt,
      usedAt: null,
      attempts: 0,
    });
    await this.tokens.save(token);
    return { code, token };
  }

  /**
   * Verifica un codigo para un contacto+proposito. Solo cuenta el ULTIMO codigo
   * vigente, y cada intento (acierte o no) consume uno de MAX_CODE_ATTEMPTS: el
   * incremento es atomico, asi que intentos en paralelo no burlan el tope. Si es
   * valido, lo marca usado y devuelve el token (con accountId asociado, si lo tenia).
   */
  async consume(
    contact: string,
    purpose: VerificationPurpose,
    code: string,
  ): Promise<VerificationToken | null> {
    const token = await this.tokens.findOne({
      where: { contact: normalizeContact(contact), purpose, usedAt: IsNull() },
      order: { createdAt: 'DESC' },
    });
    if (!token) return null;

    const now = new Date();
    if (token.expiresAt.getTime() < now.getTime()) return null;

    // Reserva el intento ANTES de verificar (UPDATE ... RETURNING es atomico).
    const res = await this.tokens
      .createQueryBuilder()
      .update(VerificationToken)
      .set({ attempts: () => 'attempts + 1' })
      .where('id = :id AND used_at IS NULL', { id: token.id })
      .returning('attempts')
      .execute();
    const attempts = Number((res.raw as { attempts?: number }[])[0]?.attempts ?? NaN);
    if (!Number.isFinite(attempts) || attempts > MAX_CODE_ATTEMPTS) {
      await this.burn(token.id);
      return null;
    }

    const ok = await argon2.verify(token.codeHash, code);
    if (!ok) {
      if (attempts >= MAX_CODE_ATTEMPTS) await this.burn(token.id);
      return null;
    }

    // Un solo ganador aunque lleguen dos requests con el codigo correcto a la vez.
    const used = await this.tokens.update({ id: token.id, usedAt: IsNull() }, { usedAt: now });
    if (!used.affected) return null;
    token.usedAt = now;
    return token;
  }

  /** Inutiliza un código (intentos agotados): hay que pedir uno nuevo. */
  private async burn(id: string): Promise<void> {
    await this.tokens.update({ id, usedAt: IsNull() }, { usedAt: new Date() });
  }

  /** Limpieza de tokens vencidos (invocable por un job). */
  async purgeExpired(): Promise<number> {
    const res = await this.tokens.delete({ expiresAt: LessThan(new Date()) });
    return res.affected ?? 0;
  }
}
