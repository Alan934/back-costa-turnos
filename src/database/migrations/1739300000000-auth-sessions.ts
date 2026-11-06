import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Sesiones por dispositivo (refresh tokens rotativos con detección de reuso).
 * Reemplaza a `account.refresh_token_hash`, que se conserva solo para migrar sesiones viejas.
 */
export class AuthSessions1739300000000 implements MigrationInterface {
  name = 'AuthSessions1739300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS auth_session (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        account_id uuid NOT NULL REFERENCES account(id) ON DELETE CASCADE,
        token_hash text NOT NULL,
        prev_token_hash text NULL,
        rotated_at timestamptz NULL,
        expires_at timestamptz NOT NULL
      );
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_auth_session_account ON auth_session (account_id);`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS auth_session;`);
  }
}
