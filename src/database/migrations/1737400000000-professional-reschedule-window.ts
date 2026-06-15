import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Ventana de reprogramación por profesional: horas mínimas antes del inicio del
 * turno hasta las que el cliente puede reprogramarlo. Espeja
 * cancellation_window_hours. 0 = sin restricción. Default 24 para alinear con la
 * ventana de cancelación existente.
 */
export class ProfessionalRescheduleWindow1737400000000 implements MigrationInterface {
  name = 'ProfessionalRescheduleWindow1737400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE professional ADD COLUMN IF NOT EXISTS reschedule_window_hours integer NOT NULL DEFAULT 24;`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE professional DROP COLUMN IF EXISTS reschedule_window_hours;`,
    );
  }
}
