import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fase 1 del modelo de comercios/equipos: tablas comercio, membership y
 * comercio_invitation. Backfill: cada professional existente obtiene un
 * comercio-de-uno (copiando sus datos de negocio) + una membresia activa.
 */
export class ComerciosMemberships1736900000000 implements MigrationInterface {
  name = 'ComerciosMemberships1736900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const q = (sql: string) => queryRunner.query(sql);

    await q(`CREATE EXTENSION IF NOT EXISTS citext;`);
    await q(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`);

    await q(`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'membership_status') THEN
        CREATE TYPE membership_status AS ENUM ('invited','active','inactive');
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'invitation_status') THEN
        CREATE TYPE invitation_status AS ENUM ('pending','accepted','expired','cancelled');
      END IF;
    END $$;`);

    await q(`
      CREATE TABLE IF NOT EXISTS comercio (
        id uuid PRIMARY KEY,
        account_id uuid REFERENCES account(id) ON DELETE SET NULL,
        name text NOT NULL,
        slug text NOT NULL,
        address text,
        timezone text NOT NULL,
        is_personal boolean NOT NULL DEFAULT false,
        public_page_settings jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    await q(`CREATE UNIQUE INDEX IF NOT EXISTS uq_comercio_slug ON comercio (slug);`);

    await q(`
      CREATE TABLE IF NOT EXISTS membership (
        id uuid PRIMARY KEY,
        professional_id uuid NOT NULL REFERENCES professional(id) ON DELETE CASCADE,
        comercio_id uuid NOT NULL REFERENCES comercio(id) ON DELETE CASCADE,
        status membership_status NOT NULL DEFAULT 'active',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    await q(
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_membership_pro_comercio ON membership (professional_id, comercio_id);`,
    );
    await q(`CREATE INDEX IF NOT EXISTS idx_membership_comercio ON membership (comercio_id);`);
    await q(
      `CREATE INDEX IF NOT EXISTS idx_membership_professional ON membership (professional_id);`,
    );

    await q(`
      CREATE TABLE IF NOT EXISTS comercio_invitation (
        id uuid PRIMARY KEY,
        comercio_id uuid NOT NULL REFERENCES comercio(id) ON DELETE CASCADE,
        email citext NOT NULL,
        token text NOT NULL,
        status invitation_status NOT NULL DEFAULT 'pending',
        expires_at timestamptz NOT NULL,
        accepted_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    await q(
      `CREATE INDEX IF NOT EXISTS idx_invitation_comercio ON comercio_invitation (comercio_id);`,
    );
    await q(
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_invitation_token ON comercio_invitation (token);`,
    );

    // ---- Backfill: comercio-de-uno + membership por cada professional ----
    await q(`
      INSERT INTO comercio (id, name, slug, address, timezone, is_personal, public_page_settings, created_at, updated_at)
      SELECT gen_random_uuid(), p.business_name, p.slug, p.address, p.timezone, true, p.public_page_settings, now(), now()
      FROM professional p
      WHERE NOT EXISTS (SELECT 1 FROM comercio c WHERE c.slug = p.slug);
    `);
    await q(`
      INSERT INTO membership (id, professional_id, comercio_id, status, created_at, updated_at)
      SELECT gen_random_uuid(), p.id, c.id, 'active', now(), now()
      FROM professional p
      JOIN comercio c ON c.slug = p.slug
      WHERE NOT EXISTS (
        SELECT 1 FROM membership m WHERE m.professional_id = p.id AND m.comercio_id = c.id
      );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const q = (sql: string) => queryRunner.query(sql);
    await q(`DROP TABLE IF EXISTS comercio_invitation;`);
    await q(`DROP TABLE IF EXISTS membership;`);
    await q(`DROP TABLE IF EXISTS comercio;`);
    await q(`DROP TYPE IF EXISTS invitation_status;`);
    await q(`DROP TYPE IF EXISTS membership_status;`);
  }
}
