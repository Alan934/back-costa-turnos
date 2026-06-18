import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Servicios adicionales de un turno: tabla pivot appointment<->service para turnos
 * con múltiples servicios. El servicio principal queda en appointment.service_id;
 * cada add-on seleccionado por el cliente tiene su fila acá con snapshot de precio.
 * RLS por professional_id.
 */
export class AppointmentAddons1737800000000 implements MigrationInterface {
  name = 'AppointmentAddons1737800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const q = (sql: string) => queryRunner.query(sql);

    await q(`
      CREATE TABLE IF NOT EXISTS appointment_addon (
        id uuid PRIMARY KEY,
        appointment_id uuid NOT NULL REFERENCES appointment(id) ON DELETE CASCADE,
        service_id uuid NOT NULL REFERENCES service(id) ON DELETE RESTRICT,
        professional_id uuid NOT NULL REFERENCES professional(id) ON DELETE CASCADE,
        service_name_snapshot text NOT NULL,
        price_at_booking_cents integer NOT NULL,
        discount_applied_cents integer NOT NULL DEFAULT 0,
        is_free boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    await q(
      `CREATE INDEX IF NOT EXISTS idx_appointment_addon_appointment ON appointment_addon (appointment_id);`,
    );

    const cond =
      `current_setting('app.tenant_id', true) IS NULL ` +
      `OR current_setting('app.tenant_id', true) = '' ` +
      `OR professional_id = current_setting('app.tenant_id', true)::uuid`;
    await q(`ALTER TABLE appointment_addon ENABLE ROW LEVEL SECURITY;`);
    await q(`ALTER TABLE appointment_addon FORCE ROW LEVEL SECURITY;`);
    await q(
      `CREATE POLICY tenant_isolation ON appointment_addon USING (${cond}) WITH CHECK (${cond});`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const q = (sql: string) => queryRunner.query(sql);
    await q(`DROP POLICY IF EXISTS tenant_isolation ON appointment_addon;`);
    await q(`DROP TABLE IF EXISTS appointment_addon;`);
  }
}
