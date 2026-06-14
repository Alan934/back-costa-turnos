import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Anticipación mínima de reserva por membresía (profesional-en-comercio): horas
 * mínimas que deben transcurrir entre "ahora" y el inicio del turno para que un
 * cliente pueda reservarlo. 0 = sin restricción.
 */
export class MembershipMinBookingHours1737200000000 implements MigrationInterface {
  name = 'MembershipMinBookingHours1737200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE membership ADD COLUMN IF NOT EXISTS min_booking_hours integer NOT NULL DEFAULT 0;`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE membership DROP COLUMN IF EXISTS min_booking_hours;`);
  }
}
