import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Feriados nacionales (API pública argentinadatos.com) y preferencia del profesional.
 *
 * - `holiday`: catálogo GLOBAL (sin tenant) de feriados, sincronizado por un cron desde la API.
 *   Una fila por fecha.
 * - `membership.works_holidays`: si el profesional trabaja los feriados en ese comercio.
 *   Default true = comportamiento previo (los feriados no bloquean nada hasta que lo pida).
 * - `membership_holiday_override`: excepción por feriado concreto. `works` pisa el valor
 *   general de la membresía (p.ej. "no trabajo feriados, pero este sí").
 *
 * Los feriados NO se materializan como `time_off`: se resuelven al calcular la disponibilidad,
 * así cambiar el booleano o una excepción surte efecto al instante y sin filas huérfanas.
 */
export class Holidays1739700000000 implements MigrationInterface {
  name = 'Holidays1739700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const q = (sql: string) => queryRunner.query(sql);
    await q(`
      CREATE TABLE IF NOT EXISTS holiday (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        deleted_at timestamptz NULL,
        date date NOT NULL,
        name text NOT NULL,
        kind text NOT NULL DEFAULT 'inamovible',
        CONSTRAINT uq_holiday_date UNIQUE (date)
      );
    `);
    await q(
      `ALTER TABLE membership ADD COLUMN IF NOT EXISTS works_holidays boolean NOT NULL DEFAULT true;`,
    );
    await q(`
      CREATE TABLE IF NOT EXISTS membership_holiday_override (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        deleted_at timestamptz NULL,
        membership_id uuid NOT NULL REFERENCES membership(id) ON DELETE CASCADE,
        date date NOT NULL,
        works boolean NOT NULL,
        CONSTRAINT uq_membership_holiday_override UNIQUE (membership_id, date)
      );
    `);
    await q(
      `CREATE INDEX IF NOT EXISTS idx_membership_holiday_override_membership ON membership_holiday_override (membership_id);`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const q = (sql: string) => queryRunner.query(sql);
    await q(`DROP TABLE IF EXISTS membership_holiday_override;`);
    await q(`ALTER TABLE membership DROP COLUMN IF EXISTS works_holidays;`);
    await q(`DROP TABLE IF EXISTS holiday;`);
  }
}
