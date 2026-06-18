import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Agrega `type` a `time_off`: tipo de ausencia (feriado / vacaciones / bloqueo).
 * Lo elige el profesional al crear el bloqueo y el `day-availability` público lo
 * expone para que el front coloree feriado/vacaciones/bloqueo de forma confiable
 * (sin adivinar por el texto libre de `reason`). Default 'block' para los
 * registros existentes (comportamiento anterior: bloqueo genérico).
 */
export class TimeOffType1738200000000 implements MigrationInterface {
  name = 'TimeOffType1738200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE time_off
        ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'block'
        CONSTRAINT chk_time_off_type CHECK (type IN ('holiday', 'vacation', 'block'));
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE time_off DROP COLUMN IF EXISTS type;
    `);
  }
}
