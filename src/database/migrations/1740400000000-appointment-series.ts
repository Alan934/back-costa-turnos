import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Turnos fijos: los turnos que se crean juntos al "repetir cada N semanas" comparten un
 * `series_id`. Sirve para mostrar que es un turno fijo y para cancelar "este y los siguientes"
 * de una vez. Null en todos los turnos sueltos (los existentes incluidos).
 */
export class AppointmentSeries1740400000000 implements MigrationInterface {
  name = 'AppointmentSeries1740400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE appointment ADD COLUMN IF NOT EXISTS series_id uuid NULL;`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_appointment_series ON appointment (series_id) WHERE series_id IS NOT NULL;`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_appointment_series;`);
    await queryRunner.query(`ALTER TABLE appointment DROP COLUMN IF EXISTS series_id;`);
  }
}
