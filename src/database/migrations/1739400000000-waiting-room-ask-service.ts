import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Anotarse en la sala de espera sin elegir servicio.
 *
 * - `membership.waiting_room_ask_service`: si el profesional quiere que el cliente elija el
 *   servicio al anotarse por el QR. Por defecto `false`: el cliente solo se anota y el
 *   profesional completa el servicio al atenderlo o cobrarlo.
 * - `appointment.service_id` pasa a admitir NULL: un turno de sala puede existir sin servicio
 *   hasta que el profesional lo asigne. Los turnos con agenda siguen teniéndolo siempre
 *   (lo exige la reserva), así que no cambia nada para los existentes.
 */
export class WaitingRoomAskService1739400000000 implements MigrationInterface {
  name = 'WaitingRoomAskService1739400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const q = (sql: string) => queryRunner.query(sql);
    await q(
      `ALTER TABLE membership ADD COLUMN IF NOT EXISTS waiting_room_ask_service boolean NOT NULL DEFAULT false;`,
    );
    await q(`ALTER TABLE appointment ALTER COLUMN service_id DROP NOT NULL;`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const q = (sql: string) => queryRunner.query(sql);
    // Falla a propósito si ya hay turnos de sala sin servicio: no se inventa un servicio ni se
    // borran datos. Asignales uno (o resolvelos) antes de revertir.
    await q(`ALTER TABLE appointment ALTER COLUMN service_id SET NOT NULL;`);
    await q(`ALTER TABLE membership DROP COLUMN IF EXISTS waiting_room_ask_service;`);
  }
}
