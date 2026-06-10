import { Column, Entity, Index } from 'typeorm';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BaseEntity } from '@/common/base.entity';
import { AccountStatus } from '@/common/enums';

/**
 * Entidad de autenticacion: cualquiera que pueda (o pueda llegar a) iniciar sesion.
 * Una cuenta "no reclamada" tiene email pero password_hash NULL e is_claimed=false.
 */
@Entity('account')
export class Account extends BaseEntity {
  @ApiProperty()
  @Index('uq_account_email', { unique: true })
  @Column({ type: 'citext' })
  email!: string;

  /** NULL = cuenta sin contrasena (cargada por un profesional, aun no reclamada). */
  @ApiPropertyOptional({ nullable: true })
  @Column({ name: 'password_hash', type: 'text', nullable: true })
  passwordHash!: string | null;

  @ApiPropertyOptional({ nullable: true })
  @Index('uq_account_google_id', { unique: true, where: 'google_id IS NOT NULL' })
  @Column({ name: 'google_id', type: 'text', nullable: true })
  googleId!: string | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  @Column({ name: 'email_verified_at', type: 'timestamptz', nullable: true })
  emailVerifiedAt!: Date | null;

  @ApiProperty({ type: Boolean })
  @Column({ name: 'is_claimed', type: 'boolean', default: false })
  isClaimed!: boolean;

  @ApiProperty({ type: Boolean })
  @Column({ name: 'is_platform_admin', type: 'boolean', default: false })
  isPlatformAdmin!: boolean;

  @ApiProperty({ enum: AccountStatus, enumName: 'AccountStatus' })
  @Column({
    type: 'enum',
    enum: AccountStatus,
    enumName: 'account_status',
    default: AccountStatus.Active,
  })
  status!: AccountStatus;

  /** Hash del refresh token activo (rotativo). NULL = sin sesion. */
  @ApiPropertyOptional({ nullable: true })
  @Column({ name: 'refresh_token_hash', type: 'text', nullable: true })
  refreshTokenHash!: string | null;
}
