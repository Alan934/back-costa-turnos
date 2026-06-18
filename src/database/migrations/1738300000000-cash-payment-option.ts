import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Pago en efectivo como opción de reserva + cierre de caja.
 * - `service.allow_cash`: habilita reservar pagando en efectivo (precio tal cual,
 *   sin IVA/recargo). Backfill a true donde ya había una opción paga, para no
 *   romper las reservas en efectivo previas (antes dependían de seña/pago completo).
 * - `payment_status` suma 'deferred' (efectivo no cobrado / pagaré: el cliente debe).
 * - `payment.note`: motivo del pagaré ("pagará después", lo que charlaron, etc.).
 */
export class CashPaymentOption1738300000000 implements MigrationInterface {
  name = 'CashPaymentOption1738300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const q = (sql: string) => queryRunner.query(sql);

    await q(
      `ALTER TABLE service ADD COLUMN IF NOT EXISTS allow_cash boolean NOT NULL DEFAULT false;`,
    );
    await q(`UPDATE service SET allow_cash = true WHERE allow_full_payment OR allow_deposit;`);

    // PG 12+ permite ADD VALUE dentro de la transacción de la migración mientras el
    // valor no se use en la misma transacción (acá solo se agrega).
    await q(`ALTER TYPE payment_status ADD VALUE IF NOT EXISTS 'deferred';`);

    await q(`ALTER TABLE payment ADD COLUMN IF NOT EXISTS note text;`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const q = (sql: string) => queryRunner.query(sql);
    // El valor de enum 'deferred' no se elimina (Postgres no soporta DROP VALUE).
    await q(`ALTER TABLE payment DROP COLUMN IF EXISTS note;`);
    await q(`ALTER TABLE service DROP COLUMN IF EXISTS allow_cash;`);
  }
}
