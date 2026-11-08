import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { DateTime } from 'luxon';
import { uuidv7 } from 'uuidv7';
import { Holiday } from './entities/holiday.entity';
import { MembershipHolidayOverride } from './entities/membership-holiday-override.entity';
import { ISO_DATE_REGEX, MembershipHolidayDto } from './dto/holiday.dto';

/** API pública de feriados de Argentina. Devuelve todos los del año: GET /v1/feriados/{año}. */
export const HOLIDAYS_API_BASE = 'https://api.argentinadatos.com/v1/feriados';
/** Los feriados son nacionales: el "año actual" se mide en hora argentina. */
export const HOLIDAYS_ZONE = 'America/Argentina/Buenos_Aires';
const FETCH_TIMEOUT_MS = 10_000;

/** Forma de cada item que devuelve la API. */
interface ApiHoliday {
  fecha: string;
  tipo: string;
  nombre: string;
}

/** ¿Trabaja ese feriado? La excepción puntual (si existe) pisa el ajuste general. */
export function resolveWorks(worksHolidays: boolean, override: boolean | undefined): boolean {
  return override ?? worksHolidays;
}

/** Valida y normaliza la respuesta de la API; descarta items mal formados. */
export function parseApiHolidays(payload: unknown, year: number): ApiHoliday[] {
  if (!Array.isArray(payload)) {
    throw new Error('Respuesta inesperada de la API de feriados (no es una lista)');
  }
  const byDate = new Map<string, ApiHoliday>();
  for (const item of payload as Partial<ApiHoliday>[]) {
    if (
      typeof item?.fecha !== 'string' ||
      typeof item.nombre !== 'string' ||
      !ISO_DATE_REGEX.test(item.fecha) ||
      !item.fecha.startsWith(`${year}-`)
    ) {
      continue;
    }
    // La tabla guarda una fila por fecha: si la API repitiera una, gana la primera.
    if (!byDate.has(item.fecha)) {
      byDate.set(item.fecha, {
        fecha: item.fecha,
        nombre: item.nombre.trim(),
        tipo: typeof item.tipo === 'string' && item.tipo ? item.tipo : 'inamovible',
      });
    }
  }
  return [...byDate.values()];
}

@Injectable()
export class HolidaysService {
  private readonly logger = new Logger(HolidaysService.name);

  constructor(
    @InjectRepository(Holiday) private readonly holidays: Repository<Holiday>,
    @InjectRepository(MembershipHolidayOverride)
    private readonly overrides: Repository<MembershipHolidayOverride>,
  ) {}

  // ---- Sincronización con la API pública ----

  /** Año actual en hora argentina. */
  currentYear(): number {
    return DateTime.now().setZone(HOLIDAYS_ZONE).year;
  }

  /**
   * Trae los feriados de `year` y los refleja en la tabla (alta/cambio de nombre y baja de los que
   * la API ya no lista). Idempotente: se puede correr N veces o desde varias instancias.
   * Si la API devuelve una lista vacía (año aún no publicado) NO borra nada.
   * Devuelve la cantidad de feriados del año tras sincronizar.
   */
  async syncYear(year: number): Promise<number> {
    const res = await fetch(`${HOLIDAYS_API_BASE}/${year}`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`La API de feriados respondió HTTP ${res.status} para ${year}`);
    const items = parseApiHolidays(await res.json(), year);
    if (items.length === 0) {
      this.logger.warn(`La API no devolvió feriados para ${year}; no se modifica nada`);
      return 0;
    }

    // upsert no dispara @BeforeInsert, así que el id (uuid v7) se genera acá. En conflicto por
    // fecha se conserva el id existente y se actualizan nombre/tipo.
    await this.holidays.upsert(
      items.map((i) => ({ id: uuidv7(), date: i.fecha, name: i.nombre, kind: i.tipo })),
      ['date'],
    );
    // Feriados del año que la API ya no lista (p.ej. un decreto los derogó).
    await this.holidays
      .createQueryBuilder()
      .delete()
      .where('date BETWEEN :from AND :to', { from: `${year}-01-01`, to: `${year}-12-31` })
      .andWhere('date NOT IN (:...dates)', { dates: items.map((i) => i.fecha) })
      .execute();
    return items.length;
  }

  /**
   * Sincroniza el año actual y el siguiente (en diciembre ya hay que mostrar enero). Cada año es
   * independiente: si uno falla se loguea y se sigue con el otro. Nunca lanza.
   */
  async syncCurrentAndNextYear(): Promise<void> {
    const year = this.currentYear();
    for (const y of [year, year + 1]) {
      try {
        const n = await this.syncYear(y);
        this.logger.log(`Feriados ${y} sincronizados: ${n}`);
      } catch (err) {
        this.logger.error(
          `No se pudieron sincronizar los feriados ${y}: ${(err as Error).message}`,
        );
      }
    }
  }

  /**
   * Al arrancar: si falta algún año (actual o siguiente) en la base, lo trae. Cubre el primer
   * despliegue (la tabla arranca vacía) sin esperar al cron mensual. Nunca lanza.
   */
  async ensureLoaded(): Promise<void> {
    const year = this.currentYear();
    for (const y of [year, year + 1]) {
      const count = await this.holidays.count({
        where: { date: Between(`${y}-01-01`, `${y}-12-31`) },
      });
      if (count > 0) continue;
      try {
        await this.syncYear(y);
        this.logger.log(`Feriados ${y} cargados al iniciar`);
      } catch (err) {
        this.logger.error(`No se pudieron cargar los feriados ${y}: ${(err as Error).message}`);
      }
    }
  }

  // ---- Consulta por profesional ----

  /** Feriados entre dos fechas (YYYY-MM-DD, inclusive), con la decisión efectiva de la membresía. */
  async listForMembership(
    membership: { id: string; worksHolidays: boolean },
    from: string,
    to: string,
  ): Promise<MembershipHolidayDto[]> {
    const [holidays, overrides] = await Promise.all([
      this.holidays.find({ where: { date: Between(from, to) }, order: { date: 'ASC' } }),
      this.overrides.find({ where: { membershipId: membership.id, date: Between(from, to) } }),
    ]);
    const overrideByDate = new Map(overrides.map((o) => [o.date, o.works]));
    return holidays.map((h) => {
      const override = overrideByDate.get(h.date);
      return {
        date: h.date,
        name: h.name,
        kind: h.kind,
        works: resolveWorks(membership.worksHolidays, override),
        overridden: override !== undefined,
      };
    });
  }

  /** Solo los feriados del rango en los que el profesional NO trabaja (los que bloquean la agenda). */
  async listBlockedForMembership(
    membership: { id: string; worksHolidays: boolean },
    from: string,
    to: string,
  ): Promise<MembershipHolidayDto[]> {
    return (await this.listForMembership(membership, from, to)).filter((h) => !h.works);
  }

  // ---- Excepciones puntuales ----

  private assertIsoDate(date: string): void {
    if (!ISO_DATE_REGEX.test(date) || !DateTime.fromISO(date).isValid) {
      throw new BadRequestException('La fecha debe ser YYYY-MM-DD');
    }
  }

  private async assertHoliday(date: string): Promise<void> {
    this.assertIsoDate(date);
    const exists = await this.holidays.exists({ where: { date } });
    if (!exists) throw new NotFoundException('Esa fecha no es un feriado');
  }

  /** Define si el profesional trabaja ESE feriado, sin importar el ajuste general. */
  async setOverride(membershipId: string, date: string, works: boolean): Promise<void> {
    await this.assertHoliday(date);
    await this.overrides.upsert({ id: uuidv7(), membershipId, date, works }, [
      'membershipId',
      'date',
    ]);
  }

  /** Quita la excepción: ese feriado vuelve a seguir el ajuste general. */
  async clearOverride(membershipId: string, date: string): Promise<void> {
    this.assertIsoDate(date);
    await this.overrides.delete({ membershipId, date });
  }
}
