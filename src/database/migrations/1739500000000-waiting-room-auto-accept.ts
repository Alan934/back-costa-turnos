import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Aceptar automáticamente a quien se anota por el QR.
 *
 * `membership.waiting_room_auto_accept`: si está activo, el cliente que se anota escaneando el QR
 * entra directo a la fila; si no (default, el comportamiento de siempre), queda pendiente hasta
 * que el profesional lo acepta.
 */
export class WaitingRoomAutoAccept1739500000000 implements MigrationInterface {
  name = 'WaitingRoomAutoAccept1739500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE membership ADD COLUMN IF NOT EXISTS waiting_room_auto_accept boolean NOT NULL DEFAULT false;`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE membership DROP COLUMN IF EXISTS waiting_room_auto_accept;`,
    );
  }
}
