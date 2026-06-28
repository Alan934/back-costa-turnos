import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Person } from './entities/person.entity';

interface FindOrCreatePersonInput {
  fullName: string;
  email?: string | null;
  phone?: string | null;
  accountId?: string | null;
}

@Injectable()
export class PersonsService {
  constructor(
    @InjectRepository(Person)
    private readonly persons: Repository<Person>,
  ) {}

  findById(id: string): Promise<Person | null> {
    return this.persons.findOne({ where: { id } });
  }

  /** Person canónica de una cuenta (la más antigua; id uuid v7 es ordenable por tiempo). */
  findByAccountId(accountId: string): Promise<Person | null> {
    return this.persons.findOne({ where: { accountId }, order: { id: 'ASC' } });
  }

  /** Lookup en lote de personas por id (para embeber nombres en listados). */
  findByIds(ids: string[]): Promise<Person[]> {
    if (ids.length === 0) return Promise.resolve([]);
    return this.persons.find({ where: { id: In(ids) } });
  }

  /**
   * Dedup por email o phone. NO asigna cuentas por coincidencia: solo reutiliza
   * la identidad global Person; el reclamo de cuenta va aparte con codigo.
   */
  async findOrCreate(input: FindOrCreatePersonInput): Promise<Person> {
    if (input.email) {
      const byEmail = await this.persons.findOne({ where: { email: input.email } });
      if (byEmail) return byEmail;
    }
    if (input.phone) {
      const byPhone = await this.persons.findOne({ where: { phone: input.phone } });
      if (byPhone) return byPhone;
    }
    const person = this.persons.create({
      fullName: input.fullName,
      email: input.email ?? null,
      phone: input.phone ?? null,
      accountId: input.accountId ?? null,
    });
    return this.persons.save(person);
  }

  async linkAccount(personId: string, accountId: string): Promise<void> {
    await this.persons.update({ id: personId }, { accountId });
  }

  /**
   * Person dueña de una cuenta autenticada (para atar un turno al cliente logueado).
   * 1) Si la cuenta ya tiene Person, la devuelve.
   * 2) Si no, intenta reclamar una identidad "suelta" (sin cuenta) que matchee por
   *    email/phone y la vincula (caso típico: reservó como invitado antes de registrarse).
   * 3) Si tampoco, crea una nueva ya vinculada.
   * Nunca devuelve ni pisa la Person de OTRA cuenta.
   */
  async findOrCreateForAccount(
    accountId: string,
    data: { fullName: string; email?: string | null; phone?: string | null },
  ): Promise<Person> {
    // Determinístico: si la cuenta tiene varias identidades (datos legados), siempre
    // se reusa la MÁS ANTIGUA como canónica. Así dos reservas de la misma cuenta
    // nunca cambian a qué identidad pertenecen los turnos. (id es uuid v7, ordenable
    // por tiempo de creación.)
    const linked = await this.persons.findOne({
      where: { accountId },
      order: { id: 'ASC' },
    });
    if (linked) return linked;

    const loose =
      (data.email && (await this.persons.findOne({ where: { email: data.email } }))) ||
      (data.phone && (await this.persons.findOne({ where: { phone: data.phone } }))) ||
      null;
    if (loose && !loose.accountId) {
      loose.accountId = accountId;
      return this.persons.save(loose);
    }

    return this.persons.save(
      this.persons.create({
        fullName: data.fullName,
        email: data.email ?? null,
        phone: data.phone ?? null,
        accountId,
      }),
    );
  }

  save(person: Person): Promise<Person> {
    return this.persons.save(person);
  }
}
