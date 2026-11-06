import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseCreatedEntity } from '@/common/base.entity';
import { Account } from '@/modules/identity/entities/account.entity';

/**
 * Sesión de un dispositivo (una por login). Reemplaza el único `refresh_token_hash` de la
 * cuenta: así iniciar sesión en otro dispositivo no cierra las demás, el logout cierra solo
 * la sesión actual y se detecta el reuso de refresh tokens ya rotados (señal de robo).
 *
 * El id de la sesión (`sid`) viaja dentro de los JWT. Se guarda el SHA-256 del refresh token
 * (alta entropía, no hace falta un hash lento) y el hash anterior, para tolerar un instante
 * de concurrencia entre pestañas sin dejar pasar un token viejo indefinidamente.
 */
@Entity('auth_session')
@Index('idx_auth_session_account', ['accountId'])
export class AuthSession extends BaseCreatedEntity {
  @Column({ name: 'account_id', type: 'uuid' })
  accountId!: string;

  @ManyToOne(() => Account, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'account_id' })
  account?: Account;

  /** SHA-256 (hex) del refresh token vigente. */
  @Column({ name: 'token_hash', type: 'text' })
  tokenHash!: string;

  /** SHA-256 del refresh token inmediatamente anterior (ventana de gracia tras rotar). */
  @Column({ name: 'prev_token_hash', type: 'text', nullable: true })
  prevTokenHash!: string | null;

  @Column({ name: 'rotated_at', type: 'timestamptz', nullable: true })
  rotatedAt!: Date | null;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;
}
