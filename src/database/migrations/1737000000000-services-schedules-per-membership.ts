import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fase 2: servicios/horarios/precios por membresia (profesional-en-comercio) +
 * mapeo horario<->servicio (schedule_rule_service).
 *
 * Enfoque ADITIVO: se agrega membership_id a service/schedule_rule/time_off y
 * comercio_id/membership_id a appointment, backfilleados desde la membresia del
 * comercio-de-uno (is_personal). Las columnas legacy (professional_id/staff_id)
 * se mantienen para no romper booking/waitlist/metricas hasta una fase posterior.
 *
 * Idempotente: usa IF NOT EXISTS / guards para poder re-correr en dev.
 */
export class ServicesSchedulesPerMembership1737000000000 implements MigrationInterface {
  name = 'ServicesSchedulesPerMembership1737000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const q = (sql: string) => queryRunner.query(sql);

    // ---- 1. Columnas nuevas (nullable al inicio para poder backfillear) ----
    await q(`ALTER TABLE service ADD COLUMN IF NOT EXISTS membership_id uuid;`);
    await q(`ALTER TABLE schedule_rule ADD COLUMN IF NOT EXISTS membership_id uuid;`);
    await q(`ALTER TABLE time_off ADD COLUMN IF NOT EXISTS membership_id uuid;`);
    await q(`ALTER TABLE appointment ADD COLUMN IF NOT EXISTS comercio_id uuid;`);
    await q(`ALTER TABLE appointment ADD COLUMN IF NOT EXISTS membership_id uuid;`);

    // ---- 2. Tabla puente schedule_rule_service ----
    await q(`
      CREATE TABLE IF NOT EXISTS schedule_rule_service (
        id uuid PRIMARY KEY,
        schedule_rule_id uuid NOT NULL REFERENCES schedule_rule(id) ON DELETE CASCADE,
        service_id uuid NOT NULL REFERENCES service(id) ON DELETE CASCADE,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    await q(
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_schedule_rule_service ON schedule_rule_service (schedule_rule_id, service_id);`,
    );
    await q(
      `CREATE INDEX IF NOT EXISTS idx_schedule_rule_service_rule ON schedule_rule_service (schedule_rule_id);`,
    );
    await q(
      `CREATE INDEX IF NOT EXISTS idx_schedule_rule_service_service ON schedule_rule_service (service_id);`,
    );

    // ---- 3. Backfill: la membresia del comercio-de-uno de cada professional ----
    // service.professional_id -> membership del comercio personal de ese professional.
    await q(`
      UPDATE service s
      SET membership_id = m.id
      FROM membership m
      JOIN comercio c ON c.id = m.comercio_id AND c.is_personal = true
      WHERE m.professional_id = s.professional_id
        AND s.membership_id IS NULL;
    `);

    // schedule_rule.staff_id -> staff.professional_id -> membership personal.
    await q(`
      UPDATE schedule_rule sr
      SET membership_id = m.id
      FROM staff st
      JOIN membership m ON m.professional_id = st.professional_id
      JOIN comercio c ON c.id = m.comercio_id AND c.is_personal = true
      WHERE st.id = sr.staff_id
        AND sr.membership_id IS NULL;
    `);

    // time_off.staff_id -> idem.
    await q(`
      UPDATE time_off t
      SET membership_id = m.id
      FROM staff st
      JOIN membership m ON m.professional_id = st.professional_id
      JOIN comercio c ON c.id = m.comercio_id AND c.is_personal = true
      WHERE st.id = t.staff_id
        AND t.membership_id IS NULL;
    `);

    // appointment.professional_id -> membership/comercio personal.
    await q(`
      UPDATE appointment a
      SET membership_id = m.id, comercio_id = m.comercio_id
      FROM membership m
      JOIN comercio c ON c.id = m.comercio_id AND c.is_personal = true
      WHERE m.professional_id = a.professional_id
        AND a.membership_id IS NULL;
    `);

    // Fix Fase 1: el comercio-de-uno backfilleado quedó sin account_id. Lo seteamos
    // desde la cuenta del profesional (su dueño) para que aparezca como "owned".
    await q(`
      UPDATE comercio c
      SET account_id = p.account_id
      FROM membership m
      JOIN professional p ON p.id = m.professional_id
      WHERE m.comercio_id = c.id
        AND c.is_personal = true
        AND c.account_id IS NULL;
    `);

    // ---- 4. Llaves foraneas + NOT NULL (solo si el backfill quedo completo) ----
    await q(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM service WHERE membership_id IS NULL) THEN
          ALTER TABLE service ALTER COLUMN membership_id SET NOT NULL;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM schedule_rule WHERE membership_id IS NULL) THEN
          ALTER TABLE schedule_rule ALTER COLUMN membership_id SET NOT NULL;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM time_off WHERE membership_id IS NULL) THEN
          ALTER TABLE time_off ALTER COLUMN membership_id SET NOT NULL;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM appointment WHERE membership_id IS NULL OR comercio_id IS NULL) THEN
          ALTER TABLE appointment ALTER COLUMN membership_id SET NOT NULL;
          ALTER TABLE appointment ALTER COLUMN comercio_id SET NOT NULL;
        END IF;
      END $$;
    `);

    await q(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_service_membership') THEN
          ALTER TABLE service ADD CONSTRAINT fk_service_membership
            FOREIGN KEY (membership_id) REFERENCES membership(id) ON DELETE CASCADE;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_schedule_rule_membership') THEN
          ALTER TABLE schedule_rule ADD CONSTRAINT fk_schedule_rule_membership
            FOREIGN KEY (membership_id) REFERENCES membership(id) ON DELETE CASCADE;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_time_off_membership') THEN
          ALTER TABLE time_off ADD CONSTRAINT fk_time_off_membership
            FOREIGN KEY (membership_id) REFERENCES membership(id) ON DELETE CASCADE;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_appointment_membership') THEN
          ALTER TABLE appointment ADD CONSTRAINT fk_appointment_membership
            FOREIGN KEY (membership_id) REFERENCES membership(id) ON DELETE RESTRICT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_appointment_comercio') THEN
          ALTER TABLE appointment ADD CONSTRAINT fk_appointment_comercio
            FOREIGN KEY (comercio_id) REFERENCES comercio(id) ON DELETE CASCADE;
        END IF;
      END $$;
    `);

    // ---- 5. Indices ----
    await q(`CREATE INDEX IF NOT EXISTS idx_service_membership ON service (membership_id);`);
    await q(
      `CREATE INDEX IF NOT EXISTS idx_schedule_rule_membership ON schedule_rule (membership_id);`,
    );
    await q(`CREATE INDEX IF NOT EXISTS idx_time_off_membership ON time_off (membership_id);`);
    await q(
      `CREATE INDEX IF NOT EXISTS idx_appointment_membership_start ON appointment (membership_id, start_at);`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const q = (sql: string) => queryRunner.query(sql);
    await q(`ALTER TABLE service DROP CONSTRAINT IF EXISTS fk_service_membership;`);
    await q(`ALTER TABLE schedule_rule DROP CONSTRAINT IF EXISTS fk_schedule_rule_membership;`);
    await q(`ALTER TABLE time_off DROP CONSTRAINT IF EXISTS fk_time_off_membership;`);
    await q(`ALTER TABLE appointment DROP CONSTRAINT IF EXISTS fk_appointment_membership;`);
    await q(`ALTER TABLE appointment DROP CONSTRAINT IF EXISTS fk_appointment_comercio;`);
    await q(`DROP TABLE IF EXISTS schedule_rule_service;`);
    await q(`ALTER TABLE service DROP COLUMN IF EXISTS membership_id;`);
    await q(`ALTER TABLE schedule_rule DROP COLUMN IF EXISTS membership_id;`);
    await q(`ALTER TABLE time_off DROP COLUMN IF EXISTS membership_id;`);
    await q(`ALTER TABLE appointment DROP COLUMN IF EXISTS membership_id;`);
    await q(`ALTER TABLE appointment DROP COLUMN IF EXISTS comercio_id;`);
  }
}
