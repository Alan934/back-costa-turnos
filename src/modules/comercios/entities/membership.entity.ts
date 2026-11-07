import { Column, Entity, Index, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BaseEntity } from '@/common/base.entity';
import { MembershipStatus, WaitingRoomStatus } from '@/common/enums';
import { Professional } from '@/modules/professionals/entities/professional.entity';
import { Comercio } from './comercio.entity';

/**
 * Membresia: un profesional (trabajador) trabajando en un comercio. Es el
 * "worker-in-comercio". En fases siguientes, sus servicios/horarios/precios
 * cuelgan de aca (membership_id).
 */
@Entity('membership')
@Unique('uq_membership_pro_comercio', ['professionalId', 'comercioId'])
@Index('idx_membership_comercio', ['comercioId'])
@Index('idx_membership_professional', ['professionalId'])
export class Membership extends BaseEntity {
  @ApiProperty({ format: 'uuid' })
  @Column({ name: 'professional_id', type: 'uuid' })
  professionalId!: string;

  @ManyToOne(() => Professional, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'professional_id' })
  professional?: Professional;

  @ApiProperty({ format: 'uuid' })
  @Column({ name: 'comercio_id', type: 'uuid' })
  comercioId!: string;

  @ManyToOne(() => Comercio, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'comercio_id' })
  comercio?: Comercio;

  @ApiProperty({ enum: MembershipStatus, enumName: 'MembershipStatus' })
  @Column({
    type: 'enum',
    enum: MembershipStatus,
    enumName: 'membership_status',
    default: MembershipStatus.Active,
  })
  status!: MembershipStatus;

  /**
   * Dirección propia del profesional EN este comercio (ej. atiende a domicilio o
   * en otra sede). NULL = se usa la dirección del comercio (fallback).
   */
  @ApiPropertyOptional({ type: String, nullable: true })
  @Column({ type: 'text', nullable: true })
  address!: string | null;

  /**
   * Anticipación mínima de reserva (en horas): un cliente solo puede reservar un
   * turno cuyo inicio esté al menos estas horas en el futuro. 0 = sin restricción.
   * Lo define el profesional para su agenda en este comercio.
   */
  @ApiProperty({ type: Number, example: 8 })
  @Column({ name: 'min_booking_hours', type: 'int', default: 0 })
  minBookingHours!: number;

  /**
   * Ventana máxima de reserva (en días): un cliente solo puede reservar un turno
   * cuyo inicio esté como mucho estos días en el futuro (p.ej. 7 = una semana,
   * 30 = un mes). 0 = sin límite. Lo define el profesional para su agenda en este
   * comercio.
   */
  @ApiProperty({ type: Number, example: 30 })
  @Column({ name: 'max_booking_days', type: 'int', default: 0 })
  maxBookingDays!: number;

  /**
   * Si está activo, un turno reservado SIN seña (cuando el servicio además admite
   * pago) queda provisional: puede ser desplazado por otro cliente que pague la
   * seña. Si está desactivado (default), el turno sin seña queda firme y nadie lo
   * puede desplazar. Lo define el profesional para su agenda en este comercio.
   */
  @ApiProperty({ type: Boolean, example: false })
  @Column({ name: 'allow_provisional_bookings', type: 'boolean', default: false })
  allowProvisionalBookings!: boolean;

  /**
   * Atiende SIEMPRE por orden de llegada: no ofrece turnos con horario, todas sus franjas de
   * trabajo son por orden de llegada. Es un interruptor reversible: al apagarlo, cada franja
   * vuelve al modo que tenía configurado.
   */
  @ApiProperty({ type: Boolean, example: false })
  @Column({ name: 'walk_in_only', type: 'boolean', default: false })
  walkInOnly!: boolean;

  // ---- Sala de espera (pantalla publica + walk-ins) ----
  /**
   * Publica la sala de espera de esta agenda en /r/:slug/sala (la pantalla del
   * QR colgado en el local). Si esta apagado, el endpoint publico responde 404.
   */
  @ApiProperty({ type: Boolean, example: true })
  @Column({ name: 'waiting_room_enabled', type: 'boolean', default: true })
  waitingRoomEnabled!: boolean;

  /**
   * Permite que un cliente se anote solo escaneando el QR. La entrada queda en
   * estado `requested` (pendiente) hasta que el profesional la acepta, asi nadie
   * mete gente en la cola sin que el profesional lo vea.
   */
  @ApiProperty({ type: Boolean, example: false })
  @Column({ name: 'waiting_room_self_check_in', type: 'boolean', default: false })
  waitingRoomSelfCheckIn!: boolean;

  /**
   * Al anotarse por el QR, el cliente elige el servicio. Apagado (default): solo se anota y el
   * profesional completa el servicio al atenderlo; si ofrece uno solo, se asigna directo.
   */
  @ApiProperty({ type: Boolean, example: false })
  @Column({ name: 'waiting_room_ask_service', type: 'boolean', default: false })
  waitingRoomAskService!: boolean;

  /** Estado operativo que ve el cliente en la pantalla publica. */
  @ApiProperty({ enum: WaitingRoomStatus, enumName: 'WaitingRoomStatus' })
  @Column({
    name: 'waiting_room_status',
    type: 'enum',
    enum: WaitingRoomStatus,
    enumName: 'waiting_room_status',
    default: WaitingRoomStatus.Open,
  })
  waitingRoomStatus!: WaitingRoomStatus;

  /** Aclaracion libre para la pantalla publica ("vuelvo 15:30"). */
  @ApiPropertyOptional({ type: String, nullable: true })
  @Column({ name: 'waiting_room_note', type: 'text', nullable: true })
  waitingRoomNote!: string | null;
}
