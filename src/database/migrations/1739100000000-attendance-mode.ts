import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Modo de atención: con turno o por orden de llegada.
 *
 * - `schedule_rule.attendance_mode`: cada franja de trabajo puede ser `appointment` (default,
 *   el comportamiento de siempre) o `walk_in` (por orden de llegada: no genera horarios
 *   reservables y la gente se anota en la sala de espera).
 * - `membership.walk_in_only`: atiende SIEMPRE por orden de llegada. Interruptor reversible
 *   que pisa el modo de las franjas sin reescribirlas.
 */
export class AttendanceMode1739100000000 implements MigrationInterface {
  name = 'AttendanceMode1739100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const q = (sql: string) => queryRunner.query(sql);
    await q(`DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'attendance_mode') THEN
          CREATE TYPE attendance_mode AS ENUM ('appointment', 'walk_in');
        END IF;
      END
    $$;`);
    await q(
      `ALTER TABLE schedule_rule ADD COLUMN IF NOT EXISTS attendance_mode attendance_mode NOT NULL DEFAULT 'appointment';`,
    );
    await q(
      `ALTER TABLE membership ADD COLUMN IF NOT EXISTS walk_in_only boolean NOT NULL DEFAULT false;`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const q = (sql: string) => queryRunner.query(sql);
    await q(`ALTER TABLE membership DROP COLUMN IF EXISTS walk_in_only;`);
    await q(`ALTER TABLE schedule_rule DROP COLUMN IF EXISTS attendance_mode;`);
    await q(`DROP TYPE IF EXISTS attendance_mode;`);
  }
}
