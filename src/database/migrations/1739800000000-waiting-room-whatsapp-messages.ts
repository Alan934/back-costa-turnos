import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Mensajes de WhatsApp personalizados del profesional para avisar a quien espera en la sala.
 *
 * `membership.waiting_room_whatsapp_messages` (jsonb, nullable): `{ called?, next?, waiting? }`.
 * NULL = todos con el texto por defecto de la app, que es lo que había hasta ahora.
 */
export class WaitingRoomWhatsappMessages1739800000000 implements MigrationInterface {
  name = 'WaitingRoomWhatsappMessages1739800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE membership ADD COLUMN IF NOT EXISTS waiting_room_whatsapp_messages jsonb;`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE membership DROP COLUMN IF EXISTS waiting_room_whatsapp_messages;`,
    );
  }
}
