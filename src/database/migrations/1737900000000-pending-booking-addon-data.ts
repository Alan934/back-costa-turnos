import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Agrega addon_data (jsonb) a pending_booking para que el webhook de MercadoPago
 * pueda recrear los appointment_addon al confirmar el pago. Nullable: null = sin addons.
 * Estructura: [{ serviceId, serviceNameSnapshot, priceAtBookingCents, discountAppliedCents, isFree }]
 */
export class PendingBookingAddonData1737900000000 implements MigrationInterface {
  name = 'PendingBookingAddonData1737900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE pending_booking ADD COLUMN IF NOT EXISTS addon_data jsonb;`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE pending_booking DROP COLUMN IF EXISTS addon_data;`);
  }
}
