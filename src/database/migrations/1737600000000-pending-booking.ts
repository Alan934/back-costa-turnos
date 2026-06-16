import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * F4: el turno con pago MercadoPago se crea recién cuando el pago se acredita.
 * Mientras el pago está Pending, los datos del turno viven en pending_booking
 * (hold del horario). Al acreditar el webhook crea el Appointment y borra este
 * registro; si el cliente abandona, expira (expires_at) y lo limpia un cron.
 *
 * Reutiliza el enum payment_type del init y crea payment_option (que solo existía
 * en la app, no como tipo PG). RLS por professional_id (tenant_isolation).
 */
export class PendingBooking1737600000000 implements MigrationInterface {
  name = 'PendingBooking1737600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const q = (sql: string) => queryRunner.query(sql);

    await q(`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_option') THEN
        CREATE TYPE payment_option AS ENUM ('deposit','full');
      END IF;
    END $$;`);

    await q(`
      CREATE TABLE IF NOT EXISTS pending_booking (
        id uuid PRIMARY KEY,
        professional_id uuid NOT NULL REFERENCES professional(id) ON DELETE CASCADE,
        comercio_id uuid NOT NULL REFERENCES comercio(id) ON DELETE CASCADE,
        membership_id uuid NOT NULL REFERENCES membership(id) ON DELETE CASCADE,
        staff_id uuid NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
        person_id uuid NOT NULL REFERENCES person(id) ON DELETE CASCADE,
        service_id uuid NOT NULL REFERENCES service(id) ON DELETE CASCADE,
        start_at timestamptz NOT NULL,
        end_at timestamptz NOT NULL,
        payment_id uuid NOT NULL UNIQUE REFERENCES payment(id) ON DELETE CASCADE,
        amount_cents integer NOT NULL,
        payment_type payment_type NOT NULL,
        payment_option payment_option NOT NULL,
        expires_at timestamptz NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    await q(
      `CREATE INDEX IF NOT EXISTS idx_pending_booking_hold ON pending_booking (professional_id, expires_at);`,
    );

    // RLS: aislamiento por tenant (professional_id), igual que el resto de tablas.
    const cond =
      `current_setting('app.tenant_id', true) IS NULL ` +
      `OR current_setting('app.tenant_id', true) = '' ` +
      `OR professional_id = current_setting('app.tenant_id', true)::uuid`;
    await q(`ALTER TABLE pending_booking ENABLE ROW LEVEL SECURITY;`);
    await q(`ALTER TABLE pending_booking FORCE ROW LEVEL SECURITY;`);
    await q(
      `CREATE POLICY tenant_isolation ON pending_booking USING (${cond}) WITH CHECK (${cond});`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const q = (sql: string) => queryRunner.query(sql);
    await q(`DROP POLICY IF EXISTS tenant_isolation ON pending_booking;`);
    await q(`DROP TABLE IF EXISTS pending_booking;`);
    await q(`DROP TYPE IF EXISTS payment_option;`);
  }
}
