import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BaseCreatedEntity } from '@/common/base.entity';
import { NotificationChannel, NotificationStatus, NotificationType } from '@/common/enums';
import { Professional } from '@/modules/professionals/entities/professional.entity';
import { Person } from '@/modules/identity/entities/person.entity';

/**
 * Cola persistida (respaldada por BullMQ/Redis para los envios y reintentos).
 */
@Entity('notification')
@Index('idx_notification_status_sched', ['status', 'scheduledFor'])
@Index('idx_notification_tenant', ['professionalId'])
export class Notification extends BaseCreatedEntity {
  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @Column({ name: 'professional_id', type: 'uuid', nullable: true })
  professionalId!: string | null;

  @ManyToOne(() => Professional, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'professional_id' })
  professional?: Professional | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @Column({ name: 'person_id', type: 'uuid', nullable: true })
  personId!: string | null;

  @ManyToOne(() => Person, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'person_id' })
  person?: Person | null;

  @ApiProperty({ enum: NotificationChannel, enumName: 'NotificationChannel' })
  @Column({
    type: 'enum',
    enum: NotificationChannel,
    enumName: 'notification_channel',
  })
  channel!: NotificationChannel;

  @ApiProperty({ enum: NotificationType, enumName: 'NotificationType' })
  @Column({
    type: 'enum',
    enum: NotificationType,
    enumName: 'notification_type',
  })
  type!: NotificationType;

  @ApiProperty({ type: 'object', additionalProperties: true })
  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  payload!: Record<string, unknown>;

  @ApiProperty({ type: String, format: 'date-time' })
  @Column({ name: 'scheduled_for', type: 'timestamptz' })
  scheduledFor!: Date;

  @ApiProperty({ enum: NotificationStatus, enumName: 'NotificationStatus' })
  @Column({
    type: 'enum',
    enum: NotificationStatus,
    enumName: 'notification_status',
    default: NotificationStatus.Queued,
  })
  status!: NotificationStatus;

  @ApiProperty({ type: Number })
  @Column({ type: 'integer', default: 0 })
  attempts!: number;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  @Column({ name: 'sent_at', type: 'timestamptz', nullable: true })
  sentAt!: Date | null;
}
