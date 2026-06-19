import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Descripciones e imágenes de ejemplo para servicios y reglas de combinación.
 * - `service.description`: texto opcional que explica qué incluye/realiza el servicio.
 * - `service.image_keys` (jsonb): hasta 3 object_keys de MinIO con imágenes de ejemplo
 *   (subidas vía POST /files?ownerType=service). Default [] para los servicios existentes.
 * - `service_combination_rule.description`: texto opcional que aclara qué se realiza al
 *   combinar dos servicios o qué tener en cuenta para relacionarlos.
 */
export class ServiceDescriptionImages1738400000000 implements MigrationInterface {
  name = 'ServiceDescriptionImages1738400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const q = (sql: string) => queryRunner.query(sql);

    await q(`ALTER TABLE service ADD COLUMN IF NOT EXISTS description text;`);
    await q(
      `ALTER TABLE service ADD COLUMN IF NOT EXISTS image_keys jsonb NOT NULL DEFAULT '[]'::jsonb;`,
    );
    await q(`ALTER TABLE service_combination_rule ADD COLUMN IF NOT EXISTS description text;`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const q = (sql: string) => queryRunner.query(sql);

    await q(`ALTER TABLE service_combination_rule DROP COLUMN IF EXISTS description;`);
    await q(`ALTER TABLE service DROP COLUMN IF EXISTS image_keys;`);
    await q(`ALTER TABLE service DROP COLUMN IF EXISTS description;`);
  }
}
