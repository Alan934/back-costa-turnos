import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Resumen diario al profesional (sus turnos de hoy, a la mañana): valor nuevo en el enum
 * `notification_type`. La preferencia vive en `professional.notification_prefs.dailySummary`
 * (jsonb, sin cambio de esquema). El down no quita el valor: Postgres no lo permite.
 */
export class DailySummary1740300000000 implements MigrationInterface {
  name = 'DailySummary1740300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'daily_summary';`,
    );
  }

  public async down(): Promise<void> {
    // Sin vuelta atrás: Postgres no permite quitar valores de un enum.
  }
}
