import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `professional.news_seen_at`: hasta cuándo el profesional ya vio las "Novedades" del Inicio
 * (reservas y cancelaciones hechas por clientes). Antes se guardaba en el navegador, así que lo
 * visto en el celular volvía a aparecer en la PC.
 */
export class ProfessionalNewsSeen1740600000000 implements MigrationInterface {
  name = 'ProfessionalNewsSeen1740600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE professional ADD COLUMN IF NOT EXISTS news_seen_at timestamptz NULL;`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE professional DROP COLUMN IF EXISTS news_seen_at;`);
  }
}
