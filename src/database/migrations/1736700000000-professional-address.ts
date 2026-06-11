import { MigrationInterface, QueryRunner } from 'typeorm';

/** Direccion del negocio en professional (pagina publica + "mis turnos"). */
export class ProfessionalAddress1736700000000 implements MigrationInterface {
  name = 'ProfessionalAddress1736700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE professional ADD COLUMN IF NOT EXISTS address text;`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE professional DROP COLUMN IF EXISTS address;`);
  }
}
