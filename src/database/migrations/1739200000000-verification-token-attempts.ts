import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Códigos de verificación: contador de intentos.
 *
 * Los códigos son de 6 dígitos (1M de combinaciones), así que sin tope de intentos se podían
 * adivinar por fuerza bruta (reset de contraseña, reclamo de cuenta). Ahora cada intento
 * incrementa `attempts` de forma atómica y al llegar al máximo el código deja de servir.
 */
export class VerificationTokenAttempts1739200000000 implements MigrationInterface {
  name = 'VerificationTokenAttempts1739200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE verification_token ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0;`,
    );
    // Índice para buscar el último código vigente de un contacto+propósito.
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_verification_contact_purpose ON verification_token (contact, purpose, created_at DESC);`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_verification_contact_purpose;`);
    await queryRunner.query(`ALTER TABLE verification_token DROP COLUMN IF EXISTS attempts;`);
  }
}
