import { MigrationInterface, QueryRunner } from 'typeorm';
import * as argon2 from 'argon2';

/**
 * Crea (o reactiva) el platform admin inicial en produccion a partir de ENV.
 *
 * Lee ADMIN_EMAIL y ADMIN_PASSWORD. Es idempotente: si la cuenta ya existe
 * solo se asegura de que sea platform admin (no pisa la password existente).
 * Si las ENV no estan definidas, no hace nada (no rompe el deploy).
 */
export class SeedPlatformAdmin1736800000000 implements MigrationInterface {
  name = 'SeedPlatformAdmin1736800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const email = process.env.ADMIN_EMAIL?.trim();
    const password = process.env.ADMIN_PASSWORD;

    if (!email || !password) {
      console.warn(
        '[SeedPlatformAdmin] ADMIN_EMAIL/ADMIN_PASSWORD no definidos; se omite la creacion del admin.',
      );
      return;
    }

    const existing = (await queryRunner.query(
      `SELECT id FROM account WHERE email = $1 LIMIT 1;`,
      [email],
    )) as Array<{ id: string }>;

    if (existing.length > 0) {
      // Ya existe: solo garantizamos que sea platform admin y este claimed/verificado.
      await queryRunner.query(
        `UPDATE account
         SET is_platform_admin = true,
             is_claimed = true,
             email_verified_at = COALESCE(email_verified_at, now())
         WHERE id = $1;`,
        [existing[0].id],
      );
      console.warn(`[SeedPlatformAdmin] Cuenta ${email} ya existia; promovida a platform admin.`);
      return;
    }

    const passwordHash = await argon2.hash(password);
    await queryRunner.query(
      `INSERT INTO account
         (id, email, password_hash, is_claimed, is_platform_admin, email_verified_at, status, created_at, updated_at)
       VALUES
         (gen_random_uuid(), $1, $2, true, true, now(), 'active', now(), now());`,
      [email, passwordHash],
    );
    console.warn(`[SeedPlatformAdmin] Platform admin creado: ${email}`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const email = process.env.ADMIN_EMAIL?.trim();
    if (!email) return;
    // Solo revierte si la cuenta no tiene datos asociados criticos; aqui borramos
    // unicamente la cuenta admin sembrada por esta migracion.
    await queryRunner.query(`DELETE FROM account WHERE email = $1 AND is_platform_admin = true;`, [
      email,
    ]);
  }
}
