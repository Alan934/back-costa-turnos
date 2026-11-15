import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Confirmación del día anterior (opcional, apagada por defecto):
 * - `professional.ask_confirmation`: el recordatorio le pide al cliente "Confirmo / No puedo ir".
 * - `appointment.client_confirmed_at`: cuándo el cliente confirmó que va (o el profesional lo
 *   marcó, si se lo dijo por WhatsApp). Null = no confirmó; se borra si el turno cambia de horario.
 */
export class ClientConfirmation1740500000000 implements MigrationInterface {
  name = 'ClientConfirmation1740500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE professional ADD COLUMN IF NOT EXISTS ask_confirmation boolean NOT NULL DEFAULT false;`,
    );
    await queryRunner.query(
      `ALTER TABLE appointment ADD COLUMN IF NOT EXISTS client_confirmed_at timestamptz NULL;`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE appointment DROP COLUMN IF EXISTS client_confirmed_at;`);
    await queryRunner.query(`ALTER TABLE professional DROP COLUMN IF EXISTS ask_confirmation;`);
  }
}
