import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { BaseCreatedEntity } from '@/common/base.entity';
import { PaymentOption, PaymentType } from '@/common/enums';
import { Payment } from '@/modules/payments/entities/payment.entity';

/**
 * Reserva pendiente de pago (hold del horario) para el flujo de seña/pago con
 * MercadoPago. Guarda los datos del turno mientras el pago está Pending: si el
 * pago se acredita (webhook), el Appointment se crea recién ahí a partir de estos
 * datos y este registro se borra; si el cliente abandona, expira (expires_at) y
 * se limpia. Mientras esté vivo, bloquea el horario (ver pendingHolds).
 *
 * Append-only/efimero: extiende BaseCreatedEntity (id v7 + created_at), sin
 * updated_at ni soft-delete (el registro se borra al confirmar/expirar).
 */
@Entity('pending_booking')
@Index('idx_pending_booking_hold', ['professionalId', 'expiresAt'])
export class PendingBooking extends BaseCreatedEntity {
  @ApiProperty({ format: 'uuid' })
  @Column({ name: 'professional_id', type: 'uuid' })
  professionalId!: string;

  @ApiProperty({ format: 'uuid' })
  @Column({ name: 'comercio_id', type: 'uuid' })
  comercioId!: string;

  @ApiProperty({ format: 'uuid' })
  @Column({ name: 'membership_id', type: 'uuid' })
  membershipId!: string;

  @ApiProperty({ format: 'uuid' })
  @Column({ name: 'staff_id', type: 'uuid' })
  staffId!: string;

  @ApiProperty({ format: 'uuid' })
  @Column({ name: 'person_id', type: 'uuid' })
  personId!: string;

  @ApiProperty({ format: 'uuid' })
  @Column({ name: 'service_id', type: 'uuid' })
  serviceId!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  @Column({ name: 'start_at', type: 'timestamptz' })
  startAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  @Column({ name: 'end_at', type: 'timestamptz' })
  endAt!: Date;

  /** Pago Pending (1:1) que cubre esta reserva. Al borrarse el pago, cae el hold. */
  @ApiProperty({ format: 'uuid' })
  @Column({ name: 'payment_id', type: 'uuid', unique: true })
  paymentId!: string;

  @ManyToOne(() => Payment, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'payment_id' })
  payment?: Payment;

  @ApiProperty({ type: Number })
  @Column({ name: 'amount_cents', type: 'integer' })
  amountCents!: number;

  @ApiProperty({ enum: PaymentType, enumName: 'PaymentType' })
  @Column({ name: 'payment_type', type: 'enum', enum: PaymentType, enumName: 'payment_type' })
  paymentType!: PaymentType;

  @ApiProperty({ enum: PaymentOption, enumName: 'PaymentOption' })
  @Column({ name: 'payment_option', type: 'enum', enum: PaymentOption, enumName: 'payment_option' })
  paymentOption!: PaymentOption;

  /** Vencimiento del hold: pasado este instante el horario se libera (lazy). */
  @ApiProperty({ type: String, format: 'date-time' })
  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  /**
   * Datos de los add-ons seleccionados al momento de la reserva (snapshot).
   * Null si el turno no tiene servicios adicionales.
   * Estructura: AddonBookingSnapshot[]
   */
  @Column({ name: 'addon_data', type: 'jsonb', nullable: true })
  addonData!: AddonBookingSnapshot[] | null;
}

export interface AddonBookingSnapshot {
  serviceId: string;
  serviceNameSnapshot: string;
  priceAtBookingCents: number;
  discountAppliedCents: number;
  isFree: boolean;
}
