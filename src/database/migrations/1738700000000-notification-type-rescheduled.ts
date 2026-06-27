import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Agrega el valor 'rescheduled' al enum `notification_type` de Postgres.
 *
 * El enum de TS (`NotificationType`) ya incluye `Rescheduled = 'rescheduled'`,
 * pero el tipo enum de la base se creó en la migración init sin ese valor, así
 * que el INSERT de la notificación de reprogramación
 * (POST /v1/me/appointments/:id/reschedule) fallaba con
 * `invalid input value for enum notification_type: "rescheduled"` (500).
 *
 * En Postgres 12+ (acá corre 16) `ALTER TYPE ... ADD VALUE` puede ejecutarse
 * dentro de una transacción siempre que el valor nuevo no se use en la misma
 * transacción —no lo usamos acá—, así que corre bien con el modo de transacción
 * `all` del runner. NO se marca `transaction = false`: en TypeORM 0.3.x con modo
 * `all` cualquier override por-migración lanza ForbiddenTransactionModeOverrideError
 * y haría fallar todo el lote de migraciones del deploy.
 * El down es no-op: Postgres no permite quitar valores de un enum.
 */
export class NotificationTypeRescheduled1738700000000
  implements MigrationInterface
{
  name = 'NotificationTypeRescheduled1738700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'rescheduled';`,
    );
  }

  public async down(): Promise<void> {
    // Postgres no permite eliminar valores de un enum; no-op.
  }
}
