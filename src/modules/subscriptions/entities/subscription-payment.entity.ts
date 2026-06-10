import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BaseCreatedEntity } from '@/common/base.entity';
import { PaymentMethod, SubscriptionPaymentStatus } from '@/common/enums';
import { Subscription } from './subscription.entity';

/**
 * Historial de cada cobro de suscripcion.
 */
@Entity('subscription_payment')
@Index('idx_subscription_payment_sub', ['subscriptionId'])
export class SubscriptionPayment extends BaseCreatedEntity {
  @ApiProperty({ format: 'uuid' })
  @Column({ name: 'subscription_id', type: 'uuid' })
  subscriptionId!: string;

  @ManyToOne(() => Subscription, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'subscription_id' })
  subscription?: Subscription;

  @ApiProperty({ type: Number })
  @Column({ name: 'amount_cents', type: 'integer' })
  amountCents!: number;

  @ApiProperty({
    enum: SubscriptionPaymentStatus,
    enumName: 'SubscriptionPaymentStatus',
  })
  @Column({
    type: 'enum',
    enum: SubscriptionPaymentStatus,
    enumName: 'subscription_payment_status',
  })
  status!: SubscriptionPaymentStatus;

  @ApiProperty({ type: String, format: 'date-time' })
  @Column({ name: 'period_start', type: 'timestamptz' })
  periodStart!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  @Column({ name: 'period_end', type: 'timestamptz' })
  periodEnd!: Date;

  @ApiPropertyOptional({ enum: PaymentMethod, enumName: 'PaymentMethod', nullable: true })
  @Column({
    type: 'enum',
    enum: PaymentMethod,
    enumName: 'payment_method',
    nullable: true,
  })
  method!: PaymentMethod | null;

  @ApiPropertyOptional({ nullable: true })
  @Column({ name: 'mercadopago_ref', type: 'text', nullable: true })
  mercadopagoRef!: string | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  @Column({ name: 'paid_at', type: 'timestamptz', nullable: true })
  paidAt!: Date | null;
}
