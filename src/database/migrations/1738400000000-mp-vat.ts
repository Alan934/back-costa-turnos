import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * IVA configurable en pagos por Mercado Pago + método transferencia.
 * - `professional.default_vat_percent` (default 4.5) y `vat_charged_to_client`: IVA por
 *   defecto que se traslada al cliente en cobros por MP (o lo absorbe el profesional).
 * - `service.vat_percent` / `vat_charged_to_client` (nullable): override por servicio.
 * - `service.allow_transfer`: habilita cobro por transferencia/QR (como efectivo, sin IVA);
 *   se backfillea desde allow_cash.
 * - `payment.vat_percent` / `vat_amount_cents`: desglose del IVA cobrado (0 fuera de MP).
 * - `payment_method` suma 'transfer'.
 */
export class MpVat1738400000000 implements MigrationInterface {
  name = 'MpVat1738400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const q = (sql: string) => queryRunner.query(sql);

    await q(
      `ALTER TABLE professional ADD COLUMN IF NOT EXISTS default_vat_percent numeric(5,2) NOT NULL DEFAULT 4.5;`,
    );
    await q(
      `ALTER TABLE professional ADD COLUMN IF NOT EXISTS vat_charged_to_client boolean NOT NULL DEFAULT true;`,
    );

    await q(`ALTER TABLE service ADD COLUMN IF NOT EXISTS vat_percent numeric(5,2);`);
    await q(`ALTER TABLE service ADD COLUMN IF NOT EXISTS vat_charged_to_client boolean;`);
    await q(
      `ALTER TABLE service ADD COLUMN IF NOT EXISTS allow_transfer boolean NOT NULL DEFAULT false;`,
    );
    await q(`UPDATE service SET allow_transfer = true WHERE allow_cash;`);

    await q(
      `ALTER TABLE payment ADD COLUMN IF NOT EXISTS vat_percent numeric(5,2) NOT NULL DEFAULT 0;`,
    );
    await q(
      `ALTER TABLE payment ADD COLUMN IF NOT EXISTS vat_amount_cents integer NOT NULL DEFAULT 0;`,
    );

    // PG 12+ permite ADD VALUE dentro de la transacción de la migración (no se usa acá).
    await q(`ALTER TYPE payment_method ADD VALUE IF NOT EXISTS 'transfer';`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const q = (sql: string) => queryRunner.query(sql);
    // El valor de enum 'transfer' no se elimina (Postgres no soporta DROP VALUE).
    await q(`ALTER TABLE payment DROP COLUMN IF EXISTS vat_amount_cents;`);
    await q(`ALTER TABLE payment DROP COLUMN IF EXISTS vat_percent;`);
    await q(`ALTER TABLE service DROP COLUMN IF EXISTS allow_transfer;`);
    await q(`ALTER TABLE service DROP COLUMN IF EXISTS vat_charged_to_client;`);
    await q(`ALTER TABLE service DROP COLUMN IF EXISTS vat_percent;`);
    await q(`ALTER TABLE professional DROP COLUMN IF EXISTS vat_charged_to_client;`);
    await q(`ALTER TABLE professional DROP COLUMN IF EXISTS default_vat_percent;`);
  }
}
