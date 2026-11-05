import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '@/common/base.entity';

/**
 * Suscripción Web Push de un navegador. Pertenece a UNO de dos dueños:
 * - un turno (`appointmentId`): el cliente de la sala de espera, que es anónimo y
 *   se identifica por el token de su link personal;
 * - una cuenta (`accountId`): el profesional, para avisarle de autoanotados.
 *
 * `endpoint` es único: re-suscribir el mismo navegador reemplaza al dueño anterior.
 */
@Entity('push_subscription')
@Index('uq_push_endpoint', ['endpoint'], { unique: true })
@Index('idx_push_appointment', ['appointmentId'])
@Index('idx_push_account', ['accountId'])
export class PushSubscription extends BaseEntity {
  @Column({ name: 'appointment_id', type: 'uuid', nullable: true })
  appointmentId!: string | null;

  @Column({ name: 'account_id', type: 'uuid', nullable: true })
  accountId!: string | null;

  @Column({ type: 'text' })
  endpoint!: string;

  @Column({ type: 'text' })
  p256dh!: string;

  @Column({ type: 'text' })
  auth!: string;
}
