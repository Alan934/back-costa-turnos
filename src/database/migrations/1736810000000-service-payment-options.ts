import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Servicios: pasa de un único deposit_mode (none/required/hybrid) a opciones de
 * pago combinables (allow_deposit / allow_full_payment / allow_no_payment).
 * El enum deposit_mode NO se elimina (professional.default_deposit_mode lo usa).
 * Idempotente: el backfill/drop solo corre si deposit_mode todavía existe.
 */
export class ServicePaymentOptions1736810000000 implements MigrationInterface {
  name = 'ServicePaymentOptions1736810000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const q = (sql: string) => queryRunner.query(sql);

    await q(
      `ALTER TABLE service ADD COLUMN IF NOT EXISTS allow_deposit boolean NOT NULL DEFAULT false;`,
    );
    await q(
      `ALTER TABLE service ADD COLUMN IF NOT EXISTS allow_full_payment boolean NOT NULL DEFAULT false;`,
    );
    await q(
      `ALTER TABLE service ADD COLUMN IF NOT EXISTS allow_no_payment boolean NOT NULL DEFAULT true;`,
    );

    // Backfill desde deposit_mode + drop, solo si la columna aún existe.
    await q(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'service' AND column_name = 'deposit_mode'
        ) THEN
          UPDATE service SET
            allow_deposit = (deposit_mode IN ('required','hybrid')),
            allow_no_payment = (deposit_mode IN ('none','hybrid')),
            allow_full_payment = false;
          ALTER TABLE service DROP COLUMN deposit_mode;
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const q = (sql: string) => queryRunner.query(sql);
    await q(
      `ALTER TABLE service ADD COLUMN IF NOT EXISTS deposit_mode deposit_mode NOT NULL DEFAULT 'none';`,
    );
    await q(`
      UPDATE service SET deposit_mode = CASE
        WHEN allow_deposit AND allow_no_payment THEN 'hybrid'::deposit_mode
        WHEN allow_deposit THEN 'required'::deposit_mode
        ELSE 'none'::deposit_mode
      END;
    `);
    await q(`ALTER TABLE service DROP COLUMN IF EXISTS allow_no_payment;`);
    await q(`ALTER TABLE service DROP COLUMN IF EXISTS allow_full_payment;`);
    await q(`ALTER TABLE service DROP COLUMN IF EXISTS allow_deposit;`);
  }
}
