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

  findByAccountId(accountId: string): Promise<Person | null> {
    return this.persons.findOne({ where: { accountId } });
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

  save(person: Person): Promise<Person> {
    return this.persons.save(person);
  }
}
