import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fase 5: el servicio pasa a ser del COMERCIO y se asigna a N profesionales (N:M).
 *
 * Enfoque ADITIVO: se agrega `comercio_id` a `service` (backfilleado desde la
 * membresia creadora) y una tabla puente `service_membership`. Cada servicio
 * existente se auto-asigna a su membresia creadora (una fila en el puente). Las
 * columnas legacy `membership_id`/`professional_id` se conservan como creador.
 *
 * Idempotente: usa IF NOT EXISTS / guards para poder re-correr en dev.
 */
export class ComercioServicesNm1738100000000 implements MigrationInterface {
  name = 'ComercioServicesNm1738100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const q = (sql: string) => queryRunner.query(sql);

    // ---- 1. Columna comercio_id en service (nullable para backfillear) ----
    await q(`ALTER TABLE service ADD COLUMN IF NOT EXISTS comercio_id uuid;`);

    // ---- 2. Tabla puente service_membership (N:M servicio<->membresia) ----
    // deleted_at: BaseEntity tiene soft-delete; la columna debe existir o TypeORM
    // rompe en los find. El ALTER cubre DBs donde la tabla ya se creó sin ella.
    await q(`
      CREATE TABLE IF NOT EXISTS service_membership (
        id uuid PRIMARY KEY,
        service_id uuid NOT NULL REFERENCES service(id) ON DELETE CASCADE,
        membership_id uuid NOT NULL REFERENCES membership(id) ON DELETE CASCADE,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        deleted_at timestamptz NULL
      );
    `);
    await q(`ALTER TABLE service_membership ADD COLUMN IF NOT EXISTS deleted_at timestamptz NULL;`);
    await q(
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_service_membership ON service_membership (service_id, membership_id);`,
    );
    await q(
      `CREATE INDEX IF NOT EXISTS idx_service_membership_service ON service_membership (service_id);`,
    );
    await q(
      `CREATE INDEX IF NOT EXISTS idx_service_membership_membership ON service_membership (membership_id);`,
    );
    await q(
      `CREATE INDEX IF NOT EXISTS idx_service_membership_active ON service_membership (id) WHERE deleted_at IS NULL;`,
    );

    // ---- 3. Backfill ----
    // comercio_id desde la membresia creadora del servicio.
    await q(`
      UPDATE service s
      SET comercio_id = m.comercio_id
      FROM membership m
      WHERE m.id = s.membership_id
        AND s.comercio_id IS NULL;
    `);

    // Auto-asignacion: cada servicio se ofrece (al menos) por su membresia creadora.
    await q(`
      INSERT INTO service_membership (id, service_id, membership_id)
      SELECT gen_random_uuid(), s.id, s.membership_id
      FROM service s
      WHERE NOT EXISTS (
        SELECT 1 FROM service_membership sm
        WHERE sm.service_id = s.id AND sm.membership_id = s.membership_id
      );
    `);

    // ---- 4. NOT NULL + FK (solo si el backfill quedo completo) ----
    await q(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM service WHERE comercio_id IS NULL) THEN
          ALTER TABLE service ALTER COLUMN comercio_id SET NOT NULL;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_service_comercio') THEN
          ALTER TABLE service ADD CONSTRAINT fk_service_comercio
            FOREIGN KEY (comercio_id) REFERENCES comercio(id) ON DELETE CASCADE;
        END IF;
      END $$;
    `);

    // ---- 5. Indice ----
    await q(`CREATE INDEX IF NOT EXISTS idx_service_comercio ON service (comercio_id);`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const q = (sql: string) => queryRunner.query(sql);
    await q(`ALTER TABLE service DROP CONSTRAINT IF EXISTS fk_service_comercio;`);
    await q(`DROP INDEX IF EXISTS idx_service_comercio;`);
    await q(`DROP TABLE IF EXISTS service_membership;`);
    await q(`ALTER TABLE service DROP COLUMN IF EXISTS comercio_id;`);
  }
}
