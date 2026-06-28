import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Limpia los `professional_client` donde el dueño del tenant figura como cliente de
 * sí mismo: la persona vinculada pertenece a la MISMA cuenta que el profesional.
 *
 * Esto se ensuciaba en el flujo de "crear vínculo al reservar" (match por email/
 * teléfono): si el profesional cargaba/reservaba un turno con su propio email o
 * teléfono, su persona quedaba como cliente suyo y aparecía en GET /v1/clients.
 *
 * El fix de raíz vive en el código (no se crea el vínculo cuando la persona es del
 * dueño, y el listado lo excluye); esta migración borra los datos ya creados.
 *
 * Borrado físico (no soft-delete): son filas espurias. `client_note` referencia a
 * `professional_client` con ON DELETE CASCADE, así que las notas asociadas (improbable
 * que existan sobre uno mismo) se borran con la fila. El down es no-op: son datos
 * inválidos que no tiene sentido restaurar.
 */
export class CleanupOwnerSelfClient1738800000000 implements MigrationInterface {
  name = 'CleanupOwnerSelfClient1738800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM professional_client pc
      USING professional p, person pe
      WHERE pc.professional_id = p.id
        AND pc.person_id = pe.id
        AND pe.account_id IS NOT NULL
        AND pe.account_id = p.account_id;
    `);
  }

  public async down(): Promise<void> {
    // Datos espurios; no se restauran. no-op.
  }
}
