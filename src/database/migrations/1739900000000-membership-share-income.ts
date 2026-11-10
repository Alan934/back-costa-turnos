import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Privacidad de los ingresos del profesional frente al comercio.
 *
 * `membership.share_income_with_comercio` (boolean, default false): el profesional decide, por
 * comercio, si el dueño del comercio puede ver lo que cobra y factura en "Métricas del equipo".
 * Por defecto NO: el comercio solo ve la actividad (atendidos, ausencias, agenda ocupada).
 */
export class MembershipShareIncome1739900000000 implements MigrationInterface {
  name = 'MembershipShareIncome1739900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE membership ADD COLUMN IF NOT EXISTS share_income_with_comercio boolean NOT NULL DEFAULT false;`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE membership DROP COLUMN IF EXISTS share_income_with_comercio;`,
    );
  }
}
