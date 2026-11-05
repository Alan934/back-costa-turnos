import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Sala de espera v2: orden manual de la cola, llamado al cliente, ausencias
 * temporales, ETA aprendido, y Web Push.
 *
 * appointment:
 * - `queue_rank`: clave de orden de la cola (por defecto, ms epoch de la llegada).
 *   Reordenar reescribe estos valores; mover al final = rank máximo + 1.
 * - `is_priority`: pasa al frente de la cola (urgencia / embarazada / etc.).
 * - `called_at` / `call_count`: cuándo y cuántas veces lo llamó el profesional.
 * - `away_until` / `away_count`: "me voy y vuelvo" (ausencia con plazo y tope).
 * - `completed_at`: fin real de la atención. Junto con `actual_start_at` permite
 *   medir cuánto tarda DE VERDAD cada servicio y mejorar el ETA.
 * - `notified_second_at` / `notified_next_at`: marcas para no repetir el push
 *   "estás segundo" / "sos el siguiente".
 *
 * push_subscription: navegadores suscriptos a Web Push, por turno (cliente anónimo
 * de la sala) o por cuenta (profesional).
 */
export class WaitingRoomV21739000000000 implements MigrationInterface {
  name = 'WaitingRoomV21739000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const q = (sql: string) => queryRunner.query(sql);

    await q(`ALTER TABLE appointment ADD COLUMN IF NOT EXISTS queue_rank double precision;`);
    await q(
      `ALTER TABLE appointment ADD COLUMN IF NOT EXISTS is_priority boolean NOT NULL DEFAULT false;`,
    );
    await q(`ALTER TABLE appointment ADD COLUMN IF NOT EXISTS called_at timestamptz;`);
    await q(
      `ALTER TABLE appointment ADD COLUMN IF NOT EXISTS call_count integer NOT NULL DEFAULT 0;`,
    );
    await q(`ALTER TABLE appointment ADD COLUMN IF NOT EXISTS away_until timestamptz;`);
    await q(
      `ALTER TABLE appointment ADD COLUMN IF NOT EXISTS away_count integer NOT NULL DEFAULT 0;`,
    );
    await q(`ALTER TABLE appointment ADD COLUMN IF NOT EXISTS completed_at timestamptz;`);
    await q(`ALTER TABLE appointment ADD COLUMN IF NOT EXISTS notified_second_at timestamptz;`);
    await q(`ALTER TABLE appointment ADD COLUMN IF NOT EXISTS notified_next_at timestamptz;`);

    // Los que ya están presentes conservan su orden de llegada.
    await q(
      `UPDATE appointment SET queue_rank = EXTRACT(EPOCH FROM checked_in_at) * 1000 WHERE checked_in_at IS NOT NULL AND queue_rank IS NULL;`,
    );

    // Duraciones reales por servicio: (profesional, servicio) sobre los terminados.
    await q(
      `CREATE INDEX IF NOT EXISTS idx_appointment_done_durations ON appointment (professional_id, service_id) WHERE completed_at IS NOT NULL;`,
    );

    await q(`CREATE TABLE IF NOT EXISTS push_subscription (
      id uuid PRIMARY KEY,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      deleted_at timestamptz,
      appointment_id uuid,
      account_id uuid,
      endpoint text NOT NULL,
      p256dh text NOT NULL,
      auth text NOT NULL
    );`);
    await q(`CREATE UNIQUE INDEX IF NOT EXISTS uq_push_endpoint ON push_subscription (endpoint);`);
    await q(
      `CREATE INDEX IF NOT EXISTS idx_push_appointment ON push_subscription (appointment_id);`,
    );
    await q(`CREATE INDEX IF NOT EXISTS idx_push_account ON push_subscription (account_id);`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const q = (sql: string) => queryRunner.query(sql);
    await q(`DROP TABLE IF EXISTS push_subscription;`);
    await q(`DROP INDEX IF EXISTS idx_appointment_done_durations;`);
    for (const col of [
      'notified_next_at',
      'notified_second_at',
      'completed_at',
      'away_count',
      'away_until',
      'call_count',
      'called_at',
      'is_priority',
      'queue_rank',
    ]) {
      await q(`ALTER TABLE appointment DROP COLUMN IF EXISTS ${col};`);
    }
  }
}
