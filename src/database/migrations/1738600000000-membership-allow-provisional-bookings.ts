import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Reserva provisional opcional por membresía (profesional-en-comercio): si está
 * activo, un turno reservado sin seña (cuando el servicio además admite pago)
 * queda provisional (desplazable por quien pague). Default false = turno firme.
 */
export class MembershipAllowProvisionalBookings1738600000000 implements MigrationInterface {
  name = 'MembershipAllowProvisionalBookings1738600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE membership ADD COLUMN IF NOT EXISTS allow_provisional_bookings boolean NOT NULL DEFAULT false;`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE membership DROP COLUMN IF EXISTS allow_provisional_bookings;`,
    );
  }
}
