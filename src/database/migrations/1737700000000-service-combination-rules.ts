import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Reglas de combinación de servicios: permite al profesional definir qué servicios
 * se habilitan, excluyen, descuentan o incluyen gratis al seleccionar otro servicio.
 * Referencia a service (CASCADE): si se borra un servicio, sus reglas se borran.
 * RLS por membership_id (derivado del professional_id dueño del servicio).
 */
export class ServiceCombinationRules1737700000000 implements MigrationInterface {
  name = 'ServiceCombinationRules1737700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const q = (sql: string) => queryRunner.query(sql);

    await q(`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'combination_rule_type') THEN
        CREATE TYPE combination_rule_type AS ENUM ('enables', 'excludes', 'discount', 'free_with');
      END IF;
    END $$;`);

    await q(`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'discount_type') THEN
        CREATE TYPE discount_type AS ENUM ('percentage', 'fixed');
      END IF;
    END $$;`);

    await q(`
      CREATE TABLE IF NOT EXISTS service_combination_rule (
        id uuid PRIMARY KEY,
        membership_id uuid NOT NULL REFERENCES membership(id) ON DELETE CASCADE,
        source_service_id uuid NOT NULL REFERENCES service(id) ON DELETE CASCADE,
        target_service_id uuid NOT NULL REFERENCES service(id) ON DELETE CASCADE,
        rule_type combination_rule_type NOT NULL,
        discount_amount_cents integer,
        discount_type discount_type,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        deleted_at timestamptz,
        CONSTRAINT uq_combination_rule UNIQUE (source_service_id, target_service_id, rule_type),
        CONSTRAINT chk_different_services CHECK (source_service_id <> target_service_id),
        CONSTRAINT chk_discount_fields CHECK (
          rule_type <> 'discount'
          OR (discount_amount_cents IS NOT NULL AND discount_type IS NOT NULL)
        )
      );
    `);

    await q(`CREATE INDEX IF NOT EXISTS idx_combination_rule_source ON service_combination_rule (source_service_id);`);
    await q(`CREATE INDEX IF NOT EXISTS idx_combination_rule_membership ON service_combination_rule (membership_id);`);

    const cond =
      `current_setting('app.tenant_id', true) IS NULL ` +
      `OR current_setting('app.tenant_id', true) = '' ` +
      `OR membership_id IN (
        SELECT id FROM membership WHERE professional_id = current_setting('app.tenant_id', true)::uuid
      )`;
    await q(`ALTER TABLE service_combination_rule ENABLE ROW LEVEL SECURITY;`);
    await q(`ALTER TABLE service_combination_rule FORCE ROW LEVEL SECURITY;`);
    await q(
      `CREATE POLICY tenant_isolation ON service_combination_rule USING (${cond}) WITH CHECK (${cond});`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const q = (sql: string) => queryRunner.query(sql);
    await q(`DROP POLICY IF EXISTS tenant_isolation ON service_combination_rule;`);
    await q(`DROP TABLE IF EXISTS service_combination_rule;`);
    await q(`DROP TYPE IF EXISTS combination_rule_type;`);
    await q(`DROP TYPE IF EXISTS discount_type;`);
  }
}
