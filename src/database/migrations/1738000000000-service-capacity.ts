import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Agrega `capacity` a la tabla `service`: cuántos clientes pueden reservar
 * el mismo horario para ese servicio. Default 1 (exclusivo, comportamiento
 * anterior). Mínimo 1 (restricción de base).
 */
export class ServiceCapacity1738000000000 implements MigrationInterface {
  name = 'ServiceCapacity1738000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE service
        ADD COLUMN IF NOT EXISTS capacity integer NOT NULL DEFAULT 1
        CONSTRAINT chk_service_capacity CHECK (capacity >= 1);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE service DROP COLUMN IF EXISTS capacity;
    `);
  }
}
