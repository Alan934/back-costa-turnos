import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Avisos al profesional cuando un cliente reserva o cancela:
 *  - dos valores nuevos en el enum `notification_type` ('pro_booked', 'pro_cancelled');
 *  - `professional.notification_prefs` (jsonb) con sus preferencias ({ email, push }); vacío =
 *    todo activado.
 *
 * `ALTER TYPE ... ADD VALUE` corre dentro de la transacción del runner porque los valores
 * nuevos no se usan en la misma transacción (ver 1738700000000). El down no quita los
 * valores del enum: Postgres no lo permite.
 */
export class ProfessionalNotifications1740200000000 implements MigrationInterface {
  name = 'ProfessionalNotifications1740200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'pro_booked';`);
    await queryRunner.query(`ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'pro_cancelled';`);
    await queryRunner.query(
      `ALTER TABLE professional ADD COLUMN IF NOT EXISTS notification_prefs jsonb NOT NULL DEFAULT '{}'::jsonb;`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE professional DROP COLUMN IF EXISTS notification_prefs;`);
  }
}
