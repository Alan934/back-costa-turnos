import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fase 3: dirección propia por membresía (profesional-en-comercio). NULL = se usa
 * la dirección del comercio. Permite "ubicación del comercio vs propia".
 */
export class MembershipAddress1737100000000 implements MigrationInterface {
  name = 'MembershipAddress1737100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE membership ADD COLUMN IF NOT EXISTS address text;`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE membership DROP COLUMN IF EXISTS address;`);
  }
}
