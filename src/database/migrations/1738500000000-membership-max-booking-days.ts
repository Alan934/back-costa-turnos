import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Ventana máxima de reserva por membresía (profesional-en-comercio): días máximos
 * hacia el futuro hasta los que un cliente puede reservar un turno (p.ej. 7 = una
 * semana, 30 = un mes). 0 = sin límite.
 */
export class MembershipMaxBookingDays1738500000000 implements MigrationInterface {
  name = 'MembershipMaxBookingDays1738500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE membership ADD COLUMN IF NOT EXISTS max_booking_days integer NOT NULL DEFAULT 0;`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE membership DROP COLUMN IF EXISTS max_booking_days;`);
  }
}
