import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Sala de espera en vivo: walk-ins (clientes que llegan sin turno), check-in de
 * llegada y pantalla pública por comercio.
 *
 * - `created_via` suma 'walk_in': el turno lo crea el profesional (o el propio
 *   cliente escaneando el QR) en el momento, sin reserva previa.
 * - `appointment.checked_in_at`: cuándo la persona llegó al local. La cola de la
 *   sala muestra SOLO a los presentes, así la posición y el ETA no cuentan gente
 *   que todavía no apareció.
 * - `appointment.ticket_number`: número de turno del día por staff, asignado al
 *   hacer check-in. Se persiste (no se deriva del índice) para que no se le
 *   mueva el número al cliente cuando alguien sale de la cola.
 * - `appointment.public_token`: token opaco para el link personal del cliente
 *   (/sala/t/:token). No se usa el id del turno para no filtrar ids internos.
 * - `membership.waiting_room_*`: configuración de la sala por comercio
 *   (publicada o no, self check-in por QR, y estado abierto/pausa/cerrado).
 *
 * En Postgres 12+ (acá corre 16) `ALTER TYPE ... ADD VALUE` corre dentro de la
 * transacción de la migración mientras el valor nuevo no se use en la misma
 * transacción —acá solo se agrega—. NO se marca `transaction = false`: con el
 * modo de transacción `all` del runner, cualquier override por-migración lanza
 * ForbiddenTransactionModeOverrideError y voltea todo el lote del deploy.
 */
export class WaitingRoom1738900000000 implements MigrationInterface {
  name = 'WaitingRoom1738900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const q = (sql: string) => queryRunner.query(sql);

    await q(`ALTER TYPE created_via ADD VALUE IF NOT EXISTS 'walk_in';`);

    await q(`ALTER TABLE appointment ADD COLUMN IF NOT EXISTS checked_in_at timestamptz;`);
    await q(`ALTER TABLE appointment ADD COLUMN IF NOT EXISTS ticket_number integer;`);
    await q(`ALTER TABLE appointment ADD COLUMN IF NOT EXISTS public_token text;`);
    await q(
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_appointment_public_token ON appointment (public_token) WHERE public_token IS NOT NULL;`,
    );
    // La sala consulta "presentes de hoy en esta agenda" en cada refresco/evento.
    await q(
      `CREATE INDEX IF NOT EXISTS idx_appointment_staff_checked_in ON appointment (staff_id, checked_in_at);`,
    );

    await q(`DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'waiting_room_status') THEN
          CREATE TYPE waiting_room_status AS ENUM ('open', 'paused', 'closed');
        END IF;
      END
    $$;`);

    await q(
      `ALTER TABLE membership ADD COLUMN IF NOT EXISTS waiting_room_enabled boolean NOT NULL DEFAULT true;`,
    );
    await q(
      `ALTER TABLE membership ADD COLUMN IF NOT EXISTS waiting_room_self_check_in boolean NOT NULL DEFAULT false;`,
    );
    await q(
      `ALTER TABLE membership ADD COLUMN IF NOT EXISTS waiting_room_status waiting_room_status NOT NULL DEFAULT 'open';`,
    );
    await q(`ALTER TABLE membership ADD COLUMN IF NOT EXISTS waiting_room_note text;`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const q = (sql: string) => queryRunner.query(sql);
    // El valor de enum 'walk_in' no se elimina (Postgres no soporta DROP VALUE).
    await q(`ALTER TABLE membership DROP COLUMN IF EXISTS waiting_room_note;`);
    await q(`ALTER TABLE membership DROP COLUMN IF EXISTS waiting_room_status;`);
    await q(`ALTER TABLE membership DROP COLUMN IF EXISTS waiting_room_self_check_in;`);
    await q(`ALTER TABLE membership DROP COLUMN IF EXISTS waiting_room_enabled;`);
    await q(`DROP TYPE IF EXISTS waiting_room_status;`);
    await q(`DROP INDEX IF EXISTS idx_appointment_staff_checked_in;`);
    await q(`DROP INDEX IF EXISTS uq_appointment_public_token;`);
    await q(`ALTER TABLE appointment DROP COLUMN IF EXISTS public_token;`);
    await q(`ALTER TABLE appointment DROP COLUMN IF EXISTS ticket_number;`);
    await q(`ALTER TABLE appointment DROP COLUMN IF EXISTS checked_in_at;`);
  }
}
