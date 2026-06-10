import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BaseEntity } from '@/common/base.entity';
import { Account } from './account.entity';

/**
 * Identidad global de un cliente (la "Persona" reutilizable entre profesionales).
 * Matcheo/dedup por email o phone; el reclamo siempre se verifica con codigo.
 */
@Entity('person')
@Index('idx_person_email', ['email'])
@Index('idx_person_phone', ['phone'])
export class Person extends BaseEntity {
  /** NULL si es un cliente "suelto" sin cuenta todavia. */
  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @Column({ name: 'account_id', type: 'uuid', nullable: true })
  accountId!: string | null;

  @ManyToOne(() => Account, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'account_id' })
  account?: Account | null;

  @ApiProperty()
  @Column({ name: 'full_name', type: 'text' })
  fullName!: string;

  @ApiPropertyOptional({ nullable: true })
  @Column({ type: 'text', nullable: true })
  phone!: string | null;

  @ApiPropertyOptional({ nullable: true })
  @Column({ type: 'citext', nullable: true })
  email!: string | null;
}
