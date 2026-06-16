import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Idempotencia de los webhooks de suscripcion: indice unico sobre
 * subscription_payment.mercadopago_ref para que un mismo pago de MercadoPago no
 * pueda acreditarse dos veces (MP reenvia la notificacion varias veces).
 *
 * Como el bug previo dejo pagos duplicados (mismo mercadopago_ref) y el
 * current_period_end inflado, primero limpiamos:
 *  1) Borra los duplicados dejando el mas antiguo por (subscription_id, mercadopago_ref).
 *  2) Recalcula current_period_end de cada suscripcion afectada = ultimo period_end real.
 * Recien entonces crea el indice unico parcial (ignora los NULL: pagos en efectivo).
 */
export class SubscriptionPaymentMpUnique1737500000000 implements MigrationInterface {
  name = 'SubscriptionPaymentMpUnique1737500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const q = (sql: string) => queryRunner.query(sql);

    // 1) Eliminar pagos duplicados por mercadopago_ref (deja el creado primero).
    await q(`
      DELETE FROM subscription_payment sp
      USING subscription_payment keep
      WHERE sp.mercadopago_ref IS NOT NULL
        AND sp.mercadopago_ref = keep.mercadopago_ref
        AND sp.subscription_id = keep.subscription_id
        AND sp.created_at > keep.created_at;
    `);

    // 2) Recalcular current_period_end con el ultimo period_end real que quedo.
    await q(`
      UPDATE subscription s
      SET current_period_end = sub.max_end
      FROM (
        SELECT subscription_id, MAX(period_end) AS max_end
        FROM subscription_payment
        WHERE status = 'paid'
        GROUP BY subscription_id
      ) sub
      WHERE s.id = sub.subscription_id
        AND s.current_period_end <> sub.max_end;
    `);

    // 3) Indice unico parcial: un mercadopago_ref no puede repetirse. Los NULL
    //    (pagos en efectivo del admin) quedan fuera del indice.
    await q(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_subscription_payment_mp_ref
      ON subscription_payment (mercadopago_ref)
      WHERE mercadopago_ref IS NOT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS uq_subscription_payment_mp_ref;`);
  }
}
