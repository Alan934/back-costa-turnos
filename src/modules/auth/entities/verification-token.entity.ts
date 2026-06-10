import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BaseCreatedEntity } from '@/common/base.entity';
import { VerificationPurpose } from '@/common/enums';
import { Account } from '@/modules/identity/entities/account.entity';

/**
 * Codigos de un solo uso: verificar email, reclamar cuenta, reset de pass, OTP.
 * El codigo se guarda hasheado (argon2).
 */
@Entity('verification_token')
@Index('idx_verification_account', ['accountId'])
@Index('idx_verification_contact', ['contact'])
export class VerificationToken extends BaseCreatedEntity {
  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @Column({ name: 'account_id', type: 'uuid', nullable: true })
  accountId!: string | null;

  @ManyToOne(() => Account, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'account_id' })
  account?: Account | null;

  /** email o telefono destino. */
  @ApiProperty()
  @Column({ type: 'text' })
  contact!: string;

  @ApiProperty()
  @Column({ name: 'code_hash', type: 'text' })
  codeHash!: string;

  @ApiProperty({ enum: VerificationPurpose, enumName: 'VerificationPurpose' })
  @Column({
    type: 'enum',
    enum: VerificationPurpose,
    enumName: 'verification_purpose',
  })
  purpose!: VerificationPurpose;

  @ApiProperty({ type: String, format: 'date-time' })
  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  @Column({ name: 'used_at', type: 'timestamptz', nullable: true })
  usedAt!: Date | null;
}
