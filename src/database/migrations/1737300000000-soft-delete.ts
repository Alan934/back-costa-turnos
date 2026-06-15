import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Soft-delete: agrega `deleted_at timestamptz NULL` a todas las tablas que heredan
 * de BaseEntity. NULL = activo; con valor = borrado logico (TypeORM lo excluye de
 * los `find` salvo `withDeleted: true`).
 *
 * Las tablas append-only / de historial (audit_log, payment, subscription_payment,
 * verification_token, consent, notification, raffle_entry/prize, file) heredan de
 * BaseCreatedEntity y NO llevan deleted_at: su contenido se conserva siempre.
 */
export class SoftDelete1737300000000 implements MigrationInterface {
  name = 'SoftDelete1737300000000';

  /** Tablas con BaseEntity que ganan soft-delete. */
  private readonly tables = [
    'account',
    'person',
    'professional',
    'staff',
    'comercio',
    'comercio_invitation',
    'membership',
    'professional_client',
    'ficha_field',
    'client_note',
    'service',
    'schedule_rule',
    'schedule_rule_service',
    'staff_calendar_integration',
    'time_off',
    'waitlist_entry',
    'appointment',
    'payment',
    'subscription',
    'raffle',
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of this.tables) {
      await queryRunner.query(
        `ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS deleted_at timestamptz NULL;`,
      );
      // Indice parcial: acelera los filtros "solo activos" (deleted_at IS NULL).
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS "idx_${table}_active" ON "${table}" (id) WHERE deleted_at IS NULL;`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of this.tables) {
      await queryRunner.query(`DROP INDEX IF EXISTS "idx_${table}_active";`);
      await queryRunner.query(`ALTER TABLE "${table}" DROP COLUMN IF EXISTS deleted_at;`);
    }
  }
}
