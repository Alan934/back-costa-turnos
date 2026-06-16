import {
  BeforeInsert,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { uuidv7 } from 'uuidv7';
import { Appointment } from './appointment.entity';
import { Service } from '@/modules/catalog/entities/service.entity';

/**
 * Servicios adicionales (add-ons) incluidos en un turno, derivados de las reglas
 * de combinación. Cada fila es un add-on del turno; el servicio principal queda en
 * appointment.service_id. Se guarda snapshot del nombre y precio para mantener
 * el historial aunque el profesional edite el servicio después.
 */
@Entity('appointment_addon')
@Index('idx_appointment_addon_appointment', ['appointmentId'])
export class AppointmentAddon {
  @ApiProperty({ format: 'uuid' })
  @PrimaryColumn('uuid')
  id!: string;

  @BeforeInsert()
  generateId(): void {
    if (!this.id) this.id = uuidv7();
  }

  @ApiProperty({ format: 'uuid' })
  @Column({ name: 'appointment_id', type: 'uuid' })
  appointmentId!: string;

  @ManyToOne(() => Appointment, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'appointment_id' })
  appointment?: Appointment;

  @ApiProperty({ format: 'uuid' })
  @Column({ name: 'service_id', type: 'uuid' })
  serviceId!: string;

  @ManyToOne(() => Service, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'service_id' })
  service?: Service;

  /** Para RLS y queries por profesional. */
  @ApiProperty({ format: 'uuid' })
  @Column({ name: 'professional_id', type: 'uuid' })
  professionalId!: string;

  /** Snapshot del nombre al momento de reservar. */
  @ApiProperty()
  @Column({ name: 'service_name_snapshot', type: 'text' })
  serviceNameSnapshot!: string;

  /** Precio de lista del servicio al momento de reservar (centavos). */
  @ApiProperty({ type: Number })
  @Column({ name: 'price_at_booking_cents', type: 'integer' })
  priceAtBookingCents!: number;

  /** Descuento aplicado (centavos). 0 si no hay descuento. */
  @ApiProperty({ type: Number })
  @Column({ name: 'discount_applied_cents', type: 'integer', default: 0 })
  discountAppliedCents!: number;

  /** El add-on viene gratis por una regla free_with. */
  @ApiProperty({ type: Boolean })
  @Column({ name: 'is_free', type: 'boolean', default: false })
  isFree!: boolean;

  @ApiProperty({ type: String, format: 'date-time' })
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
