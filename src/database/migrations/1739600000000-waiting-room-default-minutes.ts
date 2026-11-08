import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Minutos que se demora el profesional con cada cliente de la sala que no tiene servicio.
 *
 * `membership.waiting_room_default_minutes`: se usa para estimar la espera (y el fin nominal del
 * turno) de quien se anotó sin elegir servicio. Default 30, que era el valor fijo hasta ahora.
 */
export class WaitingRoomDefaultMinutes1739600000000 implements MigrationInterface {
  name = 'WaitingRoomDefaultMinutes1739600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE membership ADD COLUMN IF NOT EXISTS waiting_room_default_minutes integer NOT NULL DEFAULT 30;`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE membership DROP COLUMN IF EXISTS waiting_room_default_minutes;`,
    );
  }
}
