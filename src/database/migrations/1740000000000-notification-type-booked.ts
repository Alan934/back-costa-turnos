import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Agrega el valor 'booked' al enum `notification_type` de Postgres: es el email de
 * confirmación que recibe el cliente al reservar un turno.
 *
 * Igual que con 'rescheduled' (ver 1738700000000): `ALTER TYPE ... ADD VALUE` corre dentro
 * de la transacción del runner porque el valor nuevo no se usa en la misma transacción, y NO
 * se marca `transaction = false`. El down es no-op: Postgres no permite quitar valores.
 */
export class NotificationTypeBooked1740000000000 implements MigrationInterface {
  name = 'NotificationTypeBooked1740000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'booked';`);
  }

  public async down(): Promise<void> {
    // Postgres no permite eliminar valores de un enum; no-op.
  }
}
