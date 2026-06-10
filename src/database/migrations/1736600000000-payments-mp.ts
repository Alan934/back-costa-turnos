import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Conexion MercadoPago del profesional (OAuth marketplace) + metodo de pago de
 * la suscripcion (efectivo vs mercadopago).
 */
export class PaymentsMp1736600000000 implements MigrationInterface {
  name = 'PaymentsMp1736600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const q = (sql: string) => queryRunner.query(sql);

    await q(`ALTER TABLE professional ADD COLUMN IF NOT EXISTS mp_user_id text;`);
    await q(`ALTER TABLE professional ADD COLUMN IF NOT EXISTS mp_access_token text;`);
    await q(`ALTER TABLE professional ADD COLUMN IF NOT EXISTS mp_refresh_token text;`);
    await q(`ALTER TABLE professional ADD COLUMN IF NOT EXISTS mp_public_key text;`);
    await q(`ALTER TABLE professional ADD COLUMN IF NOT EXISTS mp_token_expires_at timestamptz;`);
    await q(`ALTER TABLE professional ADD COLUMN IF NOT EXISTS mp_connected_at timestamptz;`);

    // Metodo del pago de suscripcion (reusa el enum payment_method: cash | mercadopago).
    await q(`ALTER TABLE subscription_payment ADD COLUMN IF NOT EXISTS method payment_method;`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const q = (sql: string) => queryRunner.query(sql);
    await q(`ALTER TABLE subscription_payment DROP COLUMN IF EXISTS method;`);
    await q(`ALTER TABLE professional DROP COLUMN IF EXISTS mp_connected_at;`);
    await q(`ALTER TABLE professional DROP COLUMN IF EXISTS mp_token_expires_at;`);
    await q(`ALTER TABLE professional DROP COLUMN IF EXISTS mp_public_key;`);
    await q(`ALTER TABLE professional DROP COLUMN IF EXISTS mp_refresh_token;`);
    await q(`ALTER TABLE professional DROP COLUMN IF EXISTS mp_access_token;`);
    await q(`ALTER TABLE professional DROP COLUMN IF EXISTS mp_user_id;`);
  }
}
