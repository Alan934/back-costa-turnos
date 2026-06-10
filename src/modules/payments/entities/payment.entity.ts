import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BaseEntity } from '@/common/base.entity';
import { PaymentMethod, PaymentStatus, PaymentType } from '@/common/enums';
import { Professional } from '@/modules/professionals/entities/professional.entity';
import { Appointment } from '@/modules/appointments/entities/appointment.entity';
import { Person } from '@/modules/identity/entities/person.entity';

/**
 * Senas y pagos de servicio (turnos). Separado de la facturacion de suscripcion.
 */
@Entity('payment')
@Index('idx_payment_tenant', ['professionalId'])
@Index('idx_payment_appointment', ['appointmentId'])
@Index('uq_payment_mp_ref', ['mercadopagoRef'], {
  unique: true,
  where: 'mercadopago_ref IS NOT NULL',
})
export class Payment extends BaseEntity {
  @ApiProperty({ format: 'uuid' })
  @Column({ name: 'professional_id', type: 'uuid' })
  professionalId!: string;

  @ManyToOne(() => Professional, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'professional_id' })
  professional?: Professional;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @Column({ name: 'appointment_id', type: 'uuid', nullable: true })
  appointmentId!: string | null;

  @ManyToOne(() => Appointment, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'appointment_id' })
  appointment?: Appointment | null;

  @ApiProperty({ format: 'uuid' })
  @Column({ name: 'person_id', type: 'uuid' })
  personId!: string;

  @ManyToOne(() => Person, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'person_id' })
  person?: Person;

  @ApiProperty({ enum: PaymentType, enumName: 'PaymentType' })
  @Column({
    type: 'enum',
    enum: PaymentType,
    enumName: 'payment_type',
  })
  type!: PaymentType;

  @ApiProperty({ type: Number })
  @Column({ name: 'amount_cents', type: 'integer' })
  amountCents!: number;

  @ApiProperty({ enum: PaymentMethod, enumName: 'PaymentMethod' })
  @Column({
    type: 'enum',
    enum: PaymentMethod,
    enumName: 'payment_method',
  })
  method!: PaymentMethod;

  @ApiProperty({ enum: PaymentStatus, enumName: 'PaymentStatus' })
  @Column({
    type: 'enum',
    enum: PaymentStatus,
    enumName: 'payment_status',
    default: PaymentStatus.Pending,
  })
  status!: PaymentStatus;

  /** id de pago de MercadoPago. */
  @ApiPropertyOptional({ nullable: true })
  @Column({ name: 'mercadopago_ref', type: 'text', nullable: true })
  mercadopagoRef!: string | null;

  /** En efectivo, lo marca el profesional. */
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  @Column({ name: 'paid_at', type: 'timestamptz', nullable: true })
  paidAt!: Date | null;
}
