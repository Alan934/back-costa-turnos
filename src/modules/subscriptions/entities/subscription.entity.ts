import { Column, Entity, Index, JoinColumn, OneToOne } from 'typeorm';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BaseEntity } from '@/common/base.entity';
import { SubscriptionStatus } from '@/common/enums';
import { Professional } from '@/modules/professionals/entities/professional.entity';

/**
 * Suscripcion del profesional (lado dueno). El estado "por vencer" no se guarda:
 * lo dispara un job que mira current_period_end.
 */
@Entity('subscription')
export class Subscription extends BaseEntity {
  @ApiProperty({ format: 'uuid' })
  @Index('uq_subscription_professional', { unique: true })
  @Column({ name: 'professional_id', type: 'uuid' })
  professionalId!: string;

  @OneToOne(() => Professional, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'professional_id' })
  professional?: Professional;

  @ApiProperty({ enum: SubscriptionStatus, enumName: 'SubscriptionStatus' })
  @Column({
    type: 'enum',
    enum: SubscriptionStatus,
    enumName: 'subscription_status',
    default: SubscriptionStatus.Trial,
  })
  status!: SubscriptionStatus;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  @Column({ name: 'trial_ends_at', type: 'timestamptz', nullable: true })
  trialEndsAt!: Date | null;

  @ApiProperty({ type: String, format: 'date-time' })
  @Column({ name: 'current_period_start', type: 'timestamptz' })
  currentPeriodStart!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  @Column({ name: 'current_period_end', type: 'timestamptz' })
  currentPeriodEnd!: Date;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  @Column({ name: 'grace_ends_at', type: 'timestamptz', nullable: true })
  graceEndsAt!: Date | null;

  @ApiProperty({ type: Number })
  @Column({ name: 'amount_cents', type: 'integer' })
  amountCents!: number;

  @ApiPropertyOptional({ nullable: true })
  @Column({ name: 'mercadopago_preapproval_id', type: 'text', nullable: true })
  mercadopagoPreapprovalId!: string | null;
}
