import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BaseEntity } from '@/common/base.entity';
import { InvitationStatus } from '@/common/enums';
import { Comercio } from './comercio.entity';

/**
 * Invitacion de un comercio a un profesional (por email). Al aceptarla con el
 * token se crea la membresia.
 */
@Entity('comercio_invitation')
@Index('idx_invitation_comercio', ['comercioId'])
@Index('uq_invitation_token', ['token'], { unique: true })
export class ComercioInvitation extends BaseEntity {
  @ApiProperty({ format: 'uuid' })
  @Column({ name: 'comercio_id', type: 'uuid' })
  comercioId!: string;

  @ManyToOne(() => Comercio, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'comercio_id' })
  comercio?: Comercio;

  @ApiProperty()
  @Column({ type: 'citext' })
  email!: string;

  /** Token aleatorio del link de invitacion. */
  @Column({ type: 'text', select: false })
  token!: string;

  @ApiProperty({ enum: InvitationStatus, enumName: 'InvitationStatus' })
  @Column({
    type: 'enum',
    enum: InvitationStatus,
    enumName: 'invitation_status',
    default: InvitationStatus.Pending,
  })
  status!: InvitationStatus;

  @ApiProperty({ type: String, format: 'date-time' })
  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  @Column({ name: 'accepted_at', type: 'timestamptz', nullable: true })
  acceptedAt!: Date | null;
}
