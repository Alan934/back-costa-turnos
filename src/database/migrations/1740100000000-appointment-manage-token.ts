import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Token del link "gestionar mi turno" (/turno/:token): deja al cliente ver, cancelar y
 * reprogramar su turno sin tener cuenta, desde el email de confirmación. Nullable: los
 * turnos existentes y las entradas de sala no lo tienen.
 */
export class AppointmentManageToken1740100000000 implements MigrationInterface {
  name = 'AppointmentManageToken1740100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE appointment ADD COLUMN IF NOT EXISTS manage_token text;`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_appointment_manage_token
         ON appointment (manage_token) WHERE manage_token IS NOT NULL;`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_appointment_manage_token;`);
    await queryRunner.query(`ALTER TABLE appointment DROP COLUMN IF EXISTS manage_token;`);
  }
}
